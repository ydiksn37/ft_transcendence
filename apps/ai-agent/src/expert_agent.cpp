#include "tetris/expert_agent.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <map>
#include <optional>
#include <queue>
#include <set>
#include <stdexcept>
#include <tuple>
#include <unordered_set>
#include <utility>
#include <vector>

namespace tetris {
namespace {

using Clock = std::chrono::steady_clock;
using Deadline = Clock::time_point;

// A narrower beam reaches the TSD conversion several placements beyond its
// setup instead of spending the whole 50 ms comparing shallow TSS variants.
constexpr std::size_t kBeamWidth = 12;
constexpr double kFutureDiscount = 0.94;
constexpr int kMaximumSevenBagPieceDistance = 13;
constexpr int kEmergencyHeight = 15;

struct SearchLimit {
  Deadline deadline;
  std::uint64_t maximumNodes;
};

using BoardFeatures = ExpertBoardEvaluation;

struct SearchNode {
  ActivePiece piece;
  std::vector<Action> actions;
  int lastRotationKickIndex = -1;
};

struct PlacementOption {
  ActivePiece placement;
  std::vector<Action> actions;
  Board board;
  int linesCleared = 0;
  std::optional<TSpin> tSpin;
  bool perfectClear = false;
};

struct RootPlacement {
  PlacementOption placement;
  Board boardBeforeGarbage;
  std::optional<PieceType> holdPiece;
  std::size_t nextIndex = 0;
};

struct BeamState {
  Board board;
  double accumulatedReward = 0.0;
  double rank = 0.0;
  std::size_t firstPlacement = 0;
  std::optional<PieceType> holdPiece;
  std::size_t nextIndex = 0;
  int backToBackChain = 0;
  int attackLaneColumn = 5;
  BoardFeatures features;
};

using SearchKey = std::tuple<int, int, int, int>;
using PlacementKey = std::tuple<int, int, int>;

bool searchLimitReached(const SearchLimit& limit,
                        std::uint64_t nodesVisited) noexcept {
  if (limit.maximumNodes > 0) return nodesVisited >= limit.maximumNodes;
  return Clock::now() >= limit.deadline;
}

std::optional<ActivePiece> applySearchAction(const Board& board,
                                             const ActivePiece& piece,
                                             Action action,
                                             int* kickIndex) {
  *kickIndex = -1;
  ActivePiece moved = piece;
  switch (action) {
    case Action::MoveLeft:
      --moved.x;
      break;
    case Action::MoveRight:
      ++moved.x;
      break;
    case Action::SoftDrop:
      ++moved.y;
      break;
    case Action::RotateClockwise:
      return tryRotate(board, piece, RotationDirection::Clockwise, kickIndex);
    case Action::RotateCounterClockwise:
      return tryRotate(board, piece, RotationDirection::CounterClockwise,
                       kickIndex);
    case Action::Rotate180:
      return tryRotate(board, piece, RotationDirection::Rotate180, kickIndex);
    case Action::HardDrop:
    case Action::Hold:
      return std::nullopt;
  }
  if (isValidPosition(board, moved)) return moved;
  return std::nullopt;
}

bool occupied(const Board& board, int row, int col) noexcept {
  return board.cells()[row][col] != Cell::Empty;
}

using CellMask =
    std::array<std::array<bool, kBoardCols>, kBoardRows>;

int countUnfillableCavityCells(const Board& board) {
  // Only cells underneath an occupied cell are cavities. Open sky and an
  // ordinary Well are not penalized merely because no piece can lock there
  // in the current position.
  CellMask cavityCandidates{};
  bool hasCandidate = false;
  for (int col = 0; col < kBoardCols; ++col) {
    bool occupiedAbove = false;
    for (int row = 0; row < kBoardRows; ++row) {
      if (occupied(board, row, col)) {
        occupiedAbove = true;
      } else if (occupiedAbove) {
        cavityCandidates[row][col] = true;
        hasCandidate = true;
      }
    }
  }
  if (!hasCandidate) return 0;

  // Check every grounded geometry of all seven pieces and all four SRS
  // orientations. This deliberately accepts even a placement whose route is
  // difficult: only cells which cannot be occupied even by a hypothetical
  // spin/tuck receive the near-disqualifying penalty. That conservative test
  // avoids rejecting valid TSD cavities and is cheap enough for every beam
  // node.
  static constexpr std::array<PieceType, 7> kPieceTypes{
      PieceType::I, PieceType::O, PieceType::T, PieceType::S,
      PieceType::Z, PieceType::J, PieceType::L,
  };
  const auto hasGroundedPlacementCovering =
      [&](int targetRow, int targetCol) {
        for (const PieceType type : kPieceTypes) {
          for (int rotation = 0; rotation < 4; ++rotation) {
            const ActivePiece origin{type, 0, 0, rotation};
            for (const Point offset : getMinoCells(origin)) {
              const ActivePiece placement{
                  type, targetCol - offset.col, targetRow - offset.row,
                  rotation};
              if (!isValidPosition(board, placement)) continue;
              ActivePiece below = placement;
              ++below.y;
              if (!isValidPosition(board, below)) return true;
            }
          }
        }
        return false;
      };

  int result = 0;
  for (int row = 0; row < kBoardRows; ++row) {
    for (int col = 0; col < kBoardCols; ++col) {
      if (cavityCandidates[row][col] &&
          !hasGroundedPlacementCovering(row, col)) {
        ++result;
      }
    }
  }
  return result;
}

bool matchesTSpinDoublePrePattern(const Board& board, int row,
                                  int col) noexcept {
  // Figure 6(a): 000 / 101. It is horizontally symmetric.
  return !occupied(board, row, col) &&
         !occupied(board, row, col + 1) &&
         !occupied(board, row, col + 2) &&
         occupied(board, row + 1, col) &&
         !occupied(board, row + 1, col + 1) &&
         occupied(board, row + 1, col + 2);
}

bool matchesTSpinDoubleReadyPattern(const Board& board, int row, int col,
                                    bool mirrored) noexcept {
  // Figure 5(a): 100 / 000 / 101 and its horizontal mirror.
  const int roofColumn = mirrored ? col + 2 : col;
  const int openRoofColumn = mirrored ? col : col + 2;
  return occupied(board, row, roofColumn) &&
         !occupied(board, row, col + 1) &&
         !occupied(board, row, openRoofColumn) &&
         !occupied(board, row + 1, col) &&
         !occupied(board, row + 1, col + 1) &&
         !occupied(board, row + 1, col + 2) &&
         occupied(board, row + 2, col) &&
         !occupied(board, row + 2, col + 1) &&
         occupied(board, row + 2, col + 2);
}

bool isRotationAction(Action action) noexcept {
  return action == Action::RotateClockwise ||
         action == Action::RotateCounterClockwise ||
         action == Action::Rotate180;
}

bool canReachTarget(const Board& board, const ActivePiece& target,
                    int linesCleared = 0) {
  if ((linesCleared != 0 && linesCleared != 2 && linesCleared != 3) ||
      calcGhostY(board, target) != target.y) return false;

  const ActivePiece spawn{target.type, 3, kSpawnY, 0};
  if (!isValidPosition(board, spawn)) return false;

  static constexpr std::array<Action, 6> kReachabilityActions{
      Action::MoveLeft,         Action::MoveRight,
      Action::RotateClockwise, Action::RotateCounterClockwise,
      Action::Rotate180,       Action::SoftDrop,
  };
  using ReachabilityKey = std::tuple<int, int, int>;
  std::queue<ActivePiece> pending;
  std::set<ReachabilityKey> visited;
  pending.push(spawn);
  visited.insert({spawn.x, spawn.y, spawn.rotation});

  while (!pending.empty()) {
    const ActivePiece piece = pending.front();
    pending.pop();
    for (const Action action : kReachabilityActions) {
      int kickIndex = -1;
      const std::optional<ActivePiece> next =
          applySearchAction(board, piece, action, &kickIndex);
      if (!next) continue;
      if (*next == target &&
          (linesCleared == 0 ||
           (isRotationAction(action) &&
            detectTSpin(board, *next, true, kickIndex, linesCleared) == TSpin::Full))) {
        return true;
      }
      const ReachabilityKey key{next->x, next->y, next->rotation};
      if (visited.insert(key).second) pending.push(*next);
    }
  }
  return false;
}

bool canReachTSpinClear(const Board& board, const ActivePiece& target,
                       int linesCleared) {
  return (linesCleared == 2 || linesCleared == 3) &&
         canReachTarget(board, target, linesCleared);
}

int readyTSpinDoubleLines(const Board& board, int row, int col) noexcept {
  const ActivePiece tPiece{PieceType::T, col, row, 2};
  if (!isValidPosition(board, tPiece) || calcGhostY(board, tPiece) != row) {
    return 0;
  }
  const int lines = clearLines(lockMino(board, tPiece)).linesCleared;
  if (!canReachTSpinClear(board, tPiece, lines)) return 0;
  return std::min(lines, 2);
}

std::array<int, kBoardCols> columnHeights(const Board& board) noexcept {
  std::array<int, kBoardCols> heights{};
  for (int col = 0; col < kBoardCols; ++col) {
    int top = kBoardRows;
    for (int row = 0; row < kBoardRows; ++row) {
      if (occupied(board, row, col)) {
        top = row;
        break;
      }
    }
    heights[col] = kBoardRows - top;
  }
  return heights;
}

std::array<int, kBoardCols> verticalShaftDepths(
    const Board& board, bool requireGarbageWalls = false) noexcept {
  std::array<int, kBoardCols> depths{};
  for (int col = 0; col < kBoardCols; ++col) {
    int streak = 0;
    for (int row = kBoardRows - 1; row >= 0; --row) {
      const bool leftWall =
          col == 0 || occupied(board, row, col - 1);
      const bool rightWall =
          col + 1 == kBoardCols || occupied(board, row, col + 1);
      const bool touchesGarbage =
          (col > 0 && board.cells()[row][col - 1] == Cell::Garbage) ||
          (col + 1 < kBoardCols &&
           board.cells()[row][col + 1] == Cell::Garbage);
      if (!occupied(board, row, col) && leftWall && rightWall &&
          (!requireGarbageWalls || touchesGarbage)) {
        ++streak;
        depths[col] = std::max(depths[col], streak);
      } else {
        streak = 0;
      }
    }
  }
  return depths;
}

std::array<int, kBoardCols> structuredWellDepths(
    const Board& board) noexcept {
  std::array<int, kBoardCols> streaks{};
  std::array<int, kBoardCols> depths{};
  for (int row = kBoardRows - 1; row >= 0; --row) {
    int emptyCount = 0;
    int emptyColumn = -1;
    for (int col = 0; col < kBoardCols; ++col) {
      if (!occupied(board, row, col)) {
        ++emptyCount;
        emptyColumn = col;
      }
    }
    for (int col = 0; col < kBoardCols; ++col) {
      if (emptyCount == 1 && emptyColumn == col) {
        ++streaks[col];
        depths[col] = std::max(depths[col], streaks[col]);
      } else {
        streaks[col] = 0;
      }
    }
  }
  return depths;
}

std::array<int, kBoardCols> surfaceWellDepths(
    const std::array<int, kBoardCols>& heights) noexcept {
  std::array<int, kBoardCols> depths{};
  for (int col = 0; col < kBoardCols; ++col) {
    // At an edge, the wall forms one side of the Well. In the interior both
    // neighbouring stacks must be higher. Looking at the surface catches a
    // second Well while it is still only two rows deep, before it becomes a
    // long fully enclosed shaft.
    const int leftHeight =
        col == 0 ? heights[col + 1] : heights[col - 1];
    const int rightHeight =
        col + 1 == kBoardCols ? heights[col - 1] : heights[col + 1];
    depths[col] = std::max(0, std::min(leftHeight, rightHeight) - heights[col]);
  }
  return depths;
}

bool isStructuredWellColumn(int col) noexcept {
  return col >= 3 && col <= 6;
}

int splitSurfaceRoughness(
    const std::array<int, kBoardCols>& heights, int wellColumn) noexcept {
  int roughness = 0;
  for (int col = 0; col + 1 < wellColumn; ++col) {
    roughness += std::abs(heights[col] - heights[col + 1]);
  }
  for (int col = wellColumn + 1; col + 1 < kBoardCols; ++col) {
    roughness += std::abs(heights[col] - heights[col + 1]);
  }
  return roughness;
}

int splitSurfaceExcessRoughness(
    const std::array<int, kBoardCols>& heights, int wellColumn) noexcept {
  int excess = 0;
  const auto addStep = [&](int left, int right) {
    excess += std::max(0, std::abs(left - right) - 2);
  };
  for (int col = 0; col + 1 < wellColumn; ++col) {
    addStep(heights[col], heights[col + 1]);
  }
  for (int col = wellColumn + 1; col + 1 < kBoardCols; ++col) {
    addStep(heights[col], heights[col + 1]);
  }
  return excess;
}

int splitShoulderExcess(const std::array<int, kBoardCols>& heights,
                       int lane) noexcept {
  if (!isStructuredWellColumn(lane)) return 0;
  const auto side = [&](int shoulder, int begin, int end) {
    int sum = 0;
    for (int col = begin; col < end; ++col) sum += heights[col];
    const int count = end - begin;
    const int averageCeil = (sum + count - 1) / count;
    // Small TSD lips are useful; tall shoulders force the rest of the stack
    // to catch up before a two-row attack can be built at their surface.
    const int excess = std::max(0, heights[shoulder] - averageCeil - 2);
    return excess * excess;
  };
  return side(lane - 1, 0, lane - 1) +
         side(lane + 1, lane + 2, kBoardCols);
}

ExpertPatternFeatures extractExpertPatternFeaturesWithHeights(
    const Board& board,
    const std::array<int, kBoardCols>& heights,
    int preferredAttackLane = -1,
    bool analyzeUnfillableCells = true) noexcept {
  ExpertPatternFeatures features;
  std::array<bool, kBoardCols> tSpinDoubleColumns{};
  CellMask ownedTSpinCells{};
  const auto ownPlacementCells = [&](const ActivePiece& target) {
    features.reachableTSpinSlots.push_back(target);
    for (const Point cell : getMinoCells(target)) {
      ownedTSpinCells[cell.row][cell.col] = true;
    }
  };
  for (int row = 0; row + 1 < kBoardRows; ++row) {
    for (int col = 0; col + 2 < kBoardCols; ++col) {
      if (matchesTSpinDoublePrePattern(board, row, col)) {
        ++features.preTSpinDoublePatterns;
      }
    }
  }
  for (int row = 0; row + 2 < kBoardRows; ++row) {
    for (int col = 0; col + 2 < kBoardCols; ++col) {
      if (matchesTSpinDoubleReadyPattern(board, row, col, false) ||
          matchesTSpinDoubleReadyPattern(board, row, col, true)) {
        const int lines = readyTSpinDoubleLines(board, row, col);
        if (lines > 0) {
          const int centerColumn = col + 1;
          tSpinDoubleColumns[centerColumn] = true;
          ++features.completedTSpinDoublePatterns;
          features.completedTSpinDoubleLines += lines;
          ownPlacementCells({PieceType::T, col, row, 2});
        }
      }
    }
  }
  // A TST must complete three rows with a vertical T (1/2/1 empty cells).
  // This cheap filter avoids running a reachability search on ordinary Wells.
  std::array<int, kBoardRows> emptyCells{};
  for (int row = 0; row < kBoardRows; ++row) {
    for (int col = 0; col < kBoardCols; ++col) {
      if (!occupied(board, row, col)) ++emptyCells[row];
    }
  }
  for (int row = 0; row + 2 < kBoardRows; ++row) {
    if (emptyCells[row] != 1 || emptyCells[row + 1] != 2 ||
        emptyCells[row + 2] != 1) continue;
    for (int col = -1; col + 1 < kBoardCols; ++col) {
      for (const int rotation : {1, 3}) {
        const ActivePiece target{PieceType::T, col, row, rotation};
        if (!isValidPosition(board, target)) continue;
        if (!canReachTSpinClear(board, target, 3)) continue;
        ++features.completedTSpinTriplePatterns;
        ownPlacementCells(target);
        // The kick entry directly above a vertical T is part of a TST setup.
        // It can remain after cash-out, so only exempt this one cell, never
        // the rest of the shaft or arbitrary holes beside the Well.
        if (row > 0 && !occupied(board, row - 1, col + 1)) {
          ownedTSpinCells[row - 1][col + 1] = true;
        }
      }
    }
  }
  // Count distinct covered cells belonging to verified TSD/TST routes.
  // A slot elsewhere on the board must never exempt an unrelated side hole.
  for (int col = 0; col < kBoardCols; ++col) {
    bool covered = false;
    for (int row = 0; row < kBoardRows; ++row) {
      if (occupied(board, row, col)) covered = true;
      else if (covered && ownedTSpinCells[row][col])
        ++features.ownedTSpinHoleCells;
    }
  }
  if (analyzeUnfillableCells) {
    features.unfillableCavityCells = countUnfillableCavityCells(board);
  }

  const std::array<int, kBoardCols> wellDepths =
      structuredWellDepths(board);
  const std::array<int, kBoardCols> shaftDepths =
      verticalShaftDepths(board);
  const std::array<int, kBoardCols> surfaceDepths =
      surfaceWellDepths(heights);
  const std::array<int, kBoardCols> garbageShaftDepths =
      verticalShaftDepths(board, true);
  for (int col = 0; col < kBoardCols; ++col) {
    features.garbageRecoveryShaftDepth = std::max(
        features.garbageRecoveryShaftDepth, garbageShaftDepths[col]);
    if (!isStructuredWellColumn(col) || wellDepths[col] == 0 ||
        garbageShaftDepths[col] >= 3) {
      continue;
    }
    const int roughness = splitSurfaceRoughness(heights, col);
    const int currentDistance = features.structuredWellColumn < 0
                                    ? -1
                                    : std::min(features.structuredWellColumn,
                                               kBoardCols - 1 -
                                                   features.structuredWellColumn);
    const int candidateDistance = std::min(col, kBoardCols - 1 - col);
    if (wellDepths[col] > features.structuredWellDepth ||
        (wellDepths[col] == features.structuredWellDepth &&
         roughness < features.structuredSideRoughness) ||
        (wellDepths[col] == features.structuredWellDepth &&
         roughness == features.structuredSideRoughness &&
         candidateDistance > currentDistance)) {
      features.structuredWellColumn = col;
      features.structuredWellDepth = wellDepths[col];
      features.structuredSideRoughness = roughness;
    }
  }

  // Pick the divider while it is still being built. Waiting until four rows
  // contain exactly one empty cell made the evaluator flat-stack over the
  // intended lane before it could recognize a 6-3/5-4 attack structure.
  const int firstCandidate = isStructuredWellColumn(preferredAttackLane)
                                 ? preferredAttackLane
                                 : 3;
  const int lastCandidate = isStructuredWellColumn(preferredAttackLane)
                                ? preferredAttackLane
                                : 6;
  for (int col = firstCandidate; col <= lastCandidate; ++col) {
    if (garbageShaftDepths[col] >= 3) continue;
    const int depth = std::max({wellDepths[col], shaftDepths[col],
                                surfaceDepths[col]});
    const int roughness = splitSurfaceRoughness(heights, col);
    const int currentDistance = features.attackLaneColumn < 0
                                    ? -1
                                    : std::min(features.attackLaneColumn,
                                               kBoardCols - 1 -
                                                   features.attackLaneColumn);
    const int candidateDistance = std::min(col, kBoardCols - 1 - col);
    if (features.attackLaneColumn < 0 ||
        depth > features.attackLaneDepth ||
        (depth == features.attackLaneDepth &&
         roughness < features.attackLaneSideRoughness) ||
        (depth == features.attackLaneDepth &&
         roughness == features.attackLaneSideRoughness &&
         candidateDistance > currentDistance)) {
      features.attackLaneColumn = col;
      features.attackLaneDepth = depth;
      features.attackLaneSideRoughness = roughness;
    }
  }
  if (features.attackLaneColumn >= 0) {
    features.attackLaneSideExcessRoughness =
        splitSurfaceExcessRoughness(heights, features.attackLaneColumn);
    features.attackLaneShoulderExcess =
        splitShoulderExcess(heights, features.attackLaneColumn);
    for (int row = 0; row < kBoardRows; ++row) {
      const Cell cell =
          board.cells()[row][features.attackLaneColumn];
      if (cell != Cell::Empty && cell != Cell::Garbage) {
        ++features.attackLaneOccupiedCells;
      }
    }
  }

  // Keep exactly one central valley as the planned I-piece Well. A strict
  // structured Well wins; while it is still being constructed, use the
  // deepest central surface valley. Edge valleys never become the primary
  // because 3-6/4-5 split stacks are intentionally preferred.
  features.primaryOpenWellColumn = features.attackLaneColumn;
  for (int col = 0; col < kBoardCols; ++col) {
    const int depth = std::max(shaftDepths[col], surfaceDepths[col]);
    // A one-row notch is normal stacking texture. From depth two onward it
    // is cheap enough to repair now, but likely to become an I-dependent
    // shaft if the beam keeps stacking around it.
    if (depth < 2 || garbageShaftDepths[col] >= 3 ||
        tSpinDoubleColumns[col]) {
      continue;
    }
    ++features.openWellCount;
    features.openWellDepthSum += depth;
    features.openWellPieceDemand += (depth + 3) / 4;
    if (col != features.primaryOpenWellColumn) {
      features.competingWellUnits += depth * depth;
    }
  }
  if (features.attackLaneColumn >= 0 && features.attackLaneDepth > 0) {
    const int distance =
        std::min(features.attackLaneColumn,
                 kBoardCols - 1 - features.attackLaneColumn);
    features.wellDistance[static_cast<std::size_t>(distance)] = 1;
  }
  return features;
}

double completedPatternMultiplier(
    const ExpertTAvailability& availability) noexcept {
  if (!availability.exact) return 0.98;
  if (availability.inHold) return 1.05;
  if (availability.movesUntilPiece <= 1) return 1.03;
  if (availability.movesUntilPiece == 2) return 1.02;
  if (availability.movesUntilPiece <= 4) return 1.00;
  if (availability.movesUntilPiece <= 6) return 0.99;
  return 0.98;
}

double prePatternMultiplier(
    const ExpertTAvailability& availability) noexcept {
  if (!availability.exact) return 0.98;
  if (availability.inHold) return 1.00;
  if (availability.movesUntilPiece == 1) return 0.99;
  if (availability.movesUntilPiece == 2) return 1.05;
  if (availability.movesUntilPiece == 3) return 1.04;
  if (availability.movesUntilPiece == 4) return 1.02;
  if (availability.movesUntilPiece <= 6) return 1.00;
  return 0.99;
}

double tWastedMultiplier(
    const ExpertTAvailability& replacementT) noexcept {
  // Using the only available T and waiting for an unseen bag is materially
  // different from spending a spare T while another is already held.
  if (replacementT.inHold) return 0.20;
  if (!replacementT.exact) return 1.50;
  return std::clamp(0.25 + 0.15 * replacementT.movesUntilPiece, 0.40, 1.50);
}

ExpertPieceAvailability determinePieceAvailability(
    PieceType target, std::optional<PieceType> holdPiece,
    const std::vector<PieceType>& nextPieces,
    std::size_t nextIndex) noexcept {
  ExpertPieceAvailability result;
  if (holdPiece == target) {
    result.movesUntilPiece = 0;
    result.inHold = true;
    result.exact = true;
    result.visibleCount = 1;
  }
  for (std::size_t index = nextIndex; index < nextPieces.size(); ++index) {
    if (nextPieces[index] != target) continue;
    ++result.visibleCount;
    if (!result.exact) {
      result.movesUntilPiece =
          static_cast<int>(index - nextIndex + 1U);
      result.exact = true;
    }
  }
  if (!result.exact) {
    result.movesUntilPiece = kMaximumSevenBagPieceDistance;
  }
  return result;
}

double iAvailabilityMultiplier(
    const ExpertIAvailability& availability) noexcept {
  // Even outside the visible preview, 7-bag guarantees the next I within at
  // most 13 pieces. Keep one ordinary Well viable, but value it less until
  // its I is close enough to plan around precisely.
  if (availability.visibleCount <= 0 || !availability.exact) return 0.90;
  if (availability.inHold || availability.movesUntilPiece <= 1) return 1.00;
  if (availability.movesUntilPiece <= 3) return 0.98;
  if (availability.movesUntilPiece <= 6) return 0.95;
  return 0.92;
}

int wellRewardUnits(int depth) noexcept {
  int units = 0;
  while (depth > 0) {
    const int rowsClearedByOneI = std::min(depth, 4);
    units += rowsClearedByOneI * rowsClearedByOneI;
    depth -= rowsClearedByOneI;
  }
  return units;
}

std::optional<std::vector<Action>> directHardDropActions(
    const Board& board, const ActivePiece& spawn, const ActivePiece& target);

struct DonationShape {
  std::string_view name;
  std::vector<ActivePiece> donors;  // relative to a rotation-2 T at (0, 0)
  std::array<unsigned, 2> clearMasks{};  // column coordinates biased by +5
};

ActivePiece mirrorDonationPiece(const ActivePiece& piece) {
  PieceType type = piece.type;
  if (type == PieceType::S) type = PieceType::Z;
  else if (type == PieceType::Z) type = PieceType::S;
  else if (type == PieceType::J) type = PieceType::L;
  else if (type == PieceType::L) type = PieceType::J;
  const auto cells = getMinoCells(piece);
  // Reflect about the center of the T, not the center of the donor's box.
  for (int rotation = 0; rotation < 4; ++rotation) {
    const auto offsets = getMinoCells({type, 0, 0, rotation});
    for (const Point offset : offsets) {
      const ActivePiece candidate{type, 2 - cells[0].col - offset.col,
                                  cells[0].row - offset.row, rotation};
      const auto reflected = getMinoCells(candidate);
      if (std::all_of(cells.begin(), cells.end(), [&](Point cell) {
            return std::any_of(reflected.begin(), reflected.end(), [&](Point other) {
              return other.row == cell.row && other.col == 2 - cell.col;
            });
          })) return candidate;
    }
  }
  return piece;  // all catalog pieces have a reflected SRS orientation
}

const std::vector<DonationShape>& donationShapes() {
  // Basic one-/two-piece donating families, including their horizontal mirrors.
  // Geometry reference: https://shiwehi.com/tetris/template/basicdonating.php
  // Roof, surrounding row completion, and the reopened shaft are verified
  // against the actual board; these are not whole-board opening book entries.
  static const auto shapes = [] {
    using P = PieceType;
    std::vector<DonationShape> result{
        {"O", {{P::O, -2, 1, 0}}},
        {"stairs", {{P::S, -1, 1, 3}}},
        {"Z", {{P::Z, -2, 0, 3}}},
        {"parapet", {{P::L, -2, 0, 1}}},
        {"L-flat", {{P::L, -3, 0, 2}}},
        {"JZ-A", {{P::J, -2, 1, 0}, {P::Z, -1, -1, 3}}},
        {"JZ-B", {{P::Z, 2, 0, 0}, {P::J, 4, 0, 3}}},
        {"STMB-cave", {{P::S, 2, 1, 0}, {P::Z, -1, -1, 3}}},
        {"SZ-B", {{P::S, -2, 1, 3}, {P::Z, -1, -1, 3}}},
        {"JS-A", {{P::J, -5, 1, 1}, {P::S, -3, 1, 0}}},
        {"JS-B", {{P::J, -3, 1, 0}, {P::S, -2, 0, 0}}},
        {"OZ", {{P::O, -1, 2, 0}, {P::Z, -2, 0, 3}}},
    };
    const auto originals = result;
    for (auto shape : originals) {
      for (auto& donor : shape.donors) donor = mirrorDonationPiece(donor);
      result.push_back(std::move(shape));
    }
    for (auto& shape : result) {
      for (const auto& donor : shape.donors) {
        for (const Point cell : getMinoCells(donor)) {
          if (cell.row == 1 || cell.row == 2)
            shape.clearMasks[cell.row - 1] |= 1U << (cell.col + 5);
        }
      }
    }
    return result;
  }();
  return shapes;
}

bool hasCoveredEmptyCell(const Board& board, int firstRow = 0) {
  for (int col = 0; col < kBoardCols; ++col) {
    bool covered = false;
    for (int row = 0; row < kBoardRows; ++row) {
      if (occupied(board, row, col)) covered = true;
      else if (covered && row >= firstRow) return true;
    }
  }
  return false;
}

bool cleanDonationResidual(const Board& board) {
  if (hasCoveredEmptyCell(board)) return false;
  const auto heights = columnHeights(board);
  if (*std::max_element(heights.begin(), heights.end()) > 10) return false;
  const auto shafts = verticalShaftDepths(board);
  const auto surface = surfaceWellDepths(heights);
  int wells = 0;
  for (int col = 0; col < kBoardCols; ++col) {
    const int depth = std::max(shafts[col], surface[col]);
    if (depth > 4) return false;
    if (depth >= 2) ++wells;
  }
  return wells <= 1;
}

std::optional<ExpertDonationPlan> findDonationTemplate(
    const Board& board, std::optional<PieceType> hold,
    const std::vector<PieceType>& next, std::size_t nextIndex) {
  const auto tSupply = determinePieceAvailability(PieceType::T, hold, next, nextIndex);
  if (!tSupply.exact || (!tSupply.inHold && tSupply.movesUntilPiece > 3) ||
      nextIndex >= next.size()) return std::nullopt;
  const auto heights = columnHeights(board);
  const int height = *std::max_element(heights.begin(), heights.end());
  if (height > 12 || height < 3) return std::nullopt;
  std::optional<ExpertDonationPlan> best;
  // No arbitrary filler placements: only missing donors and at most one roof.
  // The Hold/Next state advances exactly as it does in the real beam search.
  for (int row = kBoardRows - height - 1; row + 3 < kBoardRows; ++row) {
    int filled = 0;
    std::array<unsigned, 2> rowMasks{};
    for (int col = 0; col < kBoardCols; ++col) {
      filled += occupied(board, row + 1, col) + occupied(board, row + 2, col);
      for (int i = 0; i < 2; ++i)
        if (occupied(board, row + 1 + i, col)) rowMasks[i] |= 1U << col;
    }
    if (filled < 8) continue;
    for (int col = 0; col + 2 < kBoardCols; ++col) {
      const ActivePiece target{PieceType::T, col, row, 2};
      if (!isValidPosition(board, target)) continue;
      for (const auto& shape : donationShapes()) {
        constexpr unsigned fullRow = (1U << kBoardCols) - 1U;
        const unsigned upper = ((shape.clearMasks[0] << col) >> 5) | (7U << col);
        const unsigned lower = ((shape.clearMasks[1] << col) >> 5) | (2U << col);
        if (((rowMasks[0] | upper) & fullRow) != fullRow ||
            ((rowMasks[1] | lower) & fullRow) != fullRow) continue;
        Board completed = board;
        std::vector<ActivePiece> missing;
        bool fits = true;
        for (auto donor : shape.donors) {
          donor.x += col;
          donor.y += row;
          int present = 0;
          for (const Point cell : getMinoCells(donor)) {
            if (cell.row < 0 || cell.row >= kBoardRows || cell.col < 0 ||
                cell.col >= kBoardCols) { fits = false; break; }
            present += occupied(board, cell.row, cell.col);
          }
          if (!fits || (present != 0 && present != 4)) { fits = false; break; }
          if (present == 0) {
            missing.push_back(donor);
            completed = lockMino(completed, donor);
          }
        }
        if (!fits || !isValidPosition(completed, target) ||
            calcGhostY(completed, target) != row ||
            clearLines(lockMino(completed, target)).linesCleared != 2 ||
            !hasCoveredEmptyCell(completed, row + 3)) continue;
        const auto residual = clearLines(lockMino(completed, target)).board;
        if (!cleanDonationResidual(residual)) continue;

        std::vector<ActivePiece> path;
        const auto solve = [&](auto&& self, const Board& current,
                               std::optional<PieceType> held, std::size_t index,
                               unsigned pending, bool roofUsed) -> bool {
          if (index >= next.size()) return false;
          const auto attempt = [&](PieceType type, std::optional<PieceType> afterHold,
                                   std::size_t afterIndex) -> bool {
            if (type == PieceType::T) {
              if (pending != 0 || !canReachTSpinClear(current, target, 2)) return false;
              const auto clear = clearLines(lockMino(current, target));
              if (clear.linesCleared != 2 || !cleanDonationResidual(clear.board)) return false;
              if (!best || path.size() < best->setup.size())
                best = ExpertDonationPlan{shape.name, target, path};
              return true;
            }
            if (path.size() >= 2 || (best && path.size() >= best->setup.size()))
              return false;
            const auto place = [&](const ActivePiece& piece, unsigned afterPending,
                                   bool afterRoof) {
              if (!isValidPosition(current, piece) ||
                  (!directHardDropActions(current, {type, 3, kSpawnY, 0}, piece) &&
                   !canReachTarget(current, piece)))
                return false;
              const auto locked = lockMino(current, piece);
              if (!isValidPosition(locked, target) || clearLines(locked).linesCleared != 0)
                return false;
              path.push_back(piece);
              const bool solved = self(self, locked, afterHold, afterIndex,
                                       afterPending, afterRoof);
              path.pop_back();
              return solved;
            };
            for (std::size_t i = 0; i < missing.size(); ++i) {
              if ((pending & (1U << i)) && missing[i].type == type &&
                  place(missing[i], pending & ~(1U << i), roofUsed)) return true;
            }
            if (roofUsed) return false;
            // A roof must add an upper T corner without covering the entrance,
            // the two clear rows, or a still-missing donor. Check the actual
            // SRS T route after the complete sequence, not just three corners.
            for (int rotation = 0; rotation < (type == PieceType::O ? 1 : 4); ++rotation) {
              for (int x = -2; x < kBoardCols; ++x) {
                ActivePiece roof{type, x, kSpawnY, rotation};
                if (!isValidPosition(current, roof)) continue;
                roof.y = calcGhostY(current, roof);
                bool corner = false, overlap = false;
                for (const Point cell : getMinoCells(roof)) {
                  corner |= cell.row == row && (cell.col == col || cell.col == col + 2);
                  overlap |= cell.row == row + 1 || cell.row == row + 2;
                  for (std::size_t i = 0; i < missing.size(); ++i) {
                    if (!(pending & (1U << i))) continue;
                    for (const Point reserved : getMinoCells(missing[i]))
                      overlap |= reserved.row == cell.row && reserved.col == cell.col;
                  }
                }
                if (corner && !overlap && place(roof, pending, true)) return true;
              }
            }
            return false;
          };
          if (attempt(next[index], held, index + 1)) return true;
          if (held) return attempt(*held, next[index], index + 1);
          return index + 1 < next.size() &&
                 attempt(next[index + 1], next[index], index + 2);
        };
        solve(solve, board, hold, nextIndex, (1U << missing.size()) - 1U, false);
        if (best && best->setup.empty()) return best;
      }
    }
  }
  return best;
}

BoardFeatures evaluateBoardForExpert(const Board& board,
                                     const ExpertWeights& weights,
                                     const ExpertTAvailability& tAvailability,
                                     const ExpertIAvailability& iAvailability,
                                     int preferredAttackLane = -1,
                                     const std::vector<PieceType>* next = nullptr,
                                     std::optional<PieceType> hold = std::nullopt,
                                     std::size_t nextIndex = 0)
    noexcept {
  std::array<int, kBoardCols> heights{};
  int aggregateHeight = 0;
  int maximumHeight = 0;
  int holes = 0;
  int coveredHoleDepth = 0;
  int bumpiness = 0;
  int rowTransitions = 0;
  int columnTransitions = 0;
  int garbageCells = 0;

  for (int col = 0; col < kBoardCols; ++col) {
    int top = kBoardRows;
    int blocksAbove = 0;
    bool previousOccupied = false;
    for (int row = 0; row < kBoardRows; ++row) {
      const bool occupied = board.cells()[row][col] != Cell::Empty;
      if (occupied) {
        if (board.cells()[row][col] == Cell::Garbage) ++garbageCells;
        if (top == kBoardRows) top = row;
        ++blocksAbove;
      } else if (top != kBoardRows) {
        ++holes;
        coveredHoleDepth += blocksAbove;
      }
      if (occupied != previousOccupied) ++columnTransitions;
      previousOccupied = occupied;
    }
    if (!previousOccupied) ++columnTransitions;  // occupied floor boundary
    heights[col] = kBoardRows - top;
    aggregateHeight += heights[col];
    maximumHeight = std::max(maximumHeight, heights[col]);
  }

  for (int col = 0; col + 1 < kBoardCols; ++col) {
    bumpiness += std::abs(heights[col] - heights[col + 1]);
  }

  for (int row = 0; row < kBoardRows; ++row) {
    bool previousOccupied = true;  // side walls are occupied
    for (int col = 0; col < kBoardCols; ++col) {
      const bool occupied = board.cells()[row][col] != Cell::Empty;
      if (occupied != previousOccupied) ++rowTransitions;
      previousOccupied = occupied;
    }
    if (!previousOccupied) ++rowTransitions;
  }

  ExpertPatternFeatures patternFeatures =
      extractExpertPatternFeaturesWithHeights(board, heights,
                                              preferredAttackLane,
                                              holes > 0);
  const auto donation = next ? findDonationTemplate(board, hold, *next, nextIndex)
                             : std::nullopt;
  // This exception is supply- and route-dependent. The verified TSD must
  // reopen EVERY covered cell; a template elsewhere never excuses side holes.
  const int unownedHoleCells = donation ? 0 : holes - patternFeatures.ownedTSpinHoleCells;
  if (donation) {
    patternFeatures.unfillableCavityCells = 0;
    if (preferredAttackLane >= 0) {
      for (int row = donation->target.y + 1; row <= donation->target.y + 2; ++row) {
        const auto cell = board.cells()[row][preferredAttackLane];
        if (cell != Cell::Empty && cell != Cell::Garbage)
          --patternFeatures.attackLaneOccupiedCells;
      }
    }
  }
  // A 7-bag supplies only one T. Stop adding completed-slot reward at the
  // third simultaneous TSD; ordinary hole/height penalties then make excess
  // reservations unattractive. In danger, reserve room for only one slot.
  const int setupLimit = maximumHeight >= 12 ? 1 : 2;
  const int rewardedCompletedLines = std::min(
      patternFeatures.completedTSpinDoubleLines, 2 * setupLimit);
  // 000/101 is only a preparatory hint and also appears at the top of every
  // ordinary one-column Well. Rewarding every occurrence encouraged the AI
  // to manufacture several Wells. One hint is enough to guide a TSD build;
  // only a completed and reachable slot may earn multiple setup rewards.
  const int rewardedPrePatterns =
      std::min(patternFeatures.preTSpinDoublePatterns, 1);
  const double wellDistanceValue =
      -weights.wellDistance0Penalty * patternFeatures.wellDistance[0] -
      weights.wellDistance1Penalty * patternFeatures.wellDistance[1] +
      weights.wellDistance2Reward * patternFeatures.wellDistance[2] +
      weights.wellDistance3Reward * patternFeatures.wellDistance[3] +
      weights.wellDistance4Reward * patternFeatures.wellDistance[4];
  double stabilityValue =
      -weights.aggregateHeightPenalty * aggregateHeight -
      weights.holesPenalty * holes -
      weights.holesQuadraticPenalty * holes * holes -
      weights.coveredHolePenalty * coveredHoleDepth -
      weights.unfillableCavityPenalty *
          patternFeatures.unfillableCavityCells -
      weights.bumpinessPenalty * bumpiness -
      weights.rowTransitionsPenalty * rowTransitions -
      weights.columnTransitionsPenalty * columnTransitions -
      weights.maximumHeightPenalty * maximumHeight;

  if (holes == 0) {
    const double lowBoardFactor = std::clamp(
        static_cast<double>(12 - maximumHeight) / 12.0, 0.0, 1.0);
    stabilityValue += weights.cleanBoardReward * lowBoardFactor;
  }

  if (maximumHeight >= 11) {
    const int danger = maximumHeight - 10;
    stabilityValue -= weights.dangerQuadraticPenalty * danger * danger;
  }
  if (maximumHeight >= 15) {
    stabilityValue -=
        weights.dangerLinearPenalty * (maximumHeight - 14);
  }
  if (maximumHeight >= 18) stabilityValue -= weights.topOutPenalty;

  const double dangerMultiplier =
      1.0 + 0.12 * std::max(0, maximumHeight - 9);
  const double setupSafety = std::clamp(
      static_cast<double>(14 - maximumHeight) / 5.0, 0.25, 1.0);
  const double setupPriority = std::clamp(
      static_cast<double>(kEmergencyHeight - maximumHeight) / 2.0,
      0.0, 1.0);
  const bool cleanWellStructure =
      patternFeatures.openWellCount <= 1 &&
      patternFeatures.openWellDepthSum <= 4 &&
      patternFeatures.competingWellUnits == 0;
  const bool cleanForTSpinSetup =
      maximumHeight <= 10 && holes == 0 && cleanWellStructure &&
      patternFeatures.attackLaneSideRoughness <= 6;
  // Verified TSD/TST cavities may be preserved while otherwise clean, but
  // unrelated holes or a second/deep Well cancel setup preservation value.
  const bool safeToPreserveTSpinSetup =
      maximumHeight <= 12 && cleanWellStructure &&
      unownedHoleCells == 0;
  const bool nearbyT = tAvailability.inHold ||
      (tAvailability.exact && tAvailability.movesUntilPiece <= 3);
  const double tripleSetupValue =
      safeToPreserveTSpinSetup && nearbyT
          ? setupPriority * weights.readyTSpinTripleReward *
                std::min(patternFeatures.completedTSpinTriplePatterns, 1)
          : 0.0;
  const double completedSetupValue =
      (safeToPreserveTSpinSetup ? setupPriority : 0.0) * (
      weights.readyTSpinDoubleReward *
          patternFeatures.completedTSpinDoublePatterns +
      weights.completedTSpinDoublePatternReward * rewardedCompletedLines *
          completedPatternMultiplier(tAvailability));
  const double iSupplyFactor = iAvailabilityMultiplier(iAvailability);
  const double preparatorySetupValue =
      (cleanForTSpinSetup ? setupPriority : 0.0) * (
      weights.preTSpinDoubleReward *
          rewardedPrePatterns *
          prePatternMultiplier(tAvailability) +
      iSupplyFactor * wellDistanceValue);

  // One I services four rows. A healthy attack stack cashes out one four-row
  // Well instead of reserving several future I pieces. Visible extra I pieces
  // reduce the supply-deficit penalty, but never make a deeper Well valuable.
  const int availableIPieces = std::max(1, iAvailability.visibleCount);
  const bool immediateIAvailable =
      iAvailability.inHold ||
      (iAvailability.exact && iAvailability.movesUntilPiece <= 1);
  const int wellSupplyDeficit = std::max(
      0, patternFeatures.openWellPieceDemand - availableIPieces);
  const int unserviceableWellDepth = immediateIAvailable
                                         ? 0
                                         : std::max(
                                               0,
                                               patternFeatures.openWellDepthSum -
                                                   2);
  constexpr int supportedCapacity = 4;
  const int deepestWell = patternFeatures.structuredWellDepth;
  const int supportedWellDepth = std::min(deepestWell, supportedCapacity);
  const int supportedWellUnits = wellRewardUnits(supportedWellDepth);
  const int unsupportedDepth = std::max(
      0, patternFeatures.openWellDepthSum - supportedCapacity);
  const int unsupportedWellUnits = unsupportedDepth * unsupportedDepth;
  const double supportedWellValue =
      weights.wellReward * supportedWellUnits +
      weights.structuredStackReward * supportedWellDepth;
  const int developingAttackLaneDepth = std::max(
      0, std::min(patternFeatures.attackLaneDepth, supportedCapacity) -
             supportedWellDepth);
  const double developingAttackLaneValue =
      0.25 * weights.structuredStackReward * developingAttackLaneDepth;
  const double wellPenaltyValue =
      -weights.waitingWellPenalty * (1.0 - iSupplyFactor) *
          supportedWellUnits -
      weights.wellSupplyDeficitPenalty * wellSupplyDeficit *
          wellSupplyDeficit -
      weights.deepWellWithoutImmediateIPenalty *
          unserviceableWellDepth * unserviceableWellDepth -
      weights.unsupportedWellPenalty * unsupportedWellUnits -
      weights.attackLaneObstructionPenalty *
          patternFeatures.attackLaneOccupiedCells -
      weights.structuredSideRoughnessPenalty *
          patternFeatures.attackLaneSideRoughness -
      weights.flatSideExcessRoughnessPenalty *
          patternFeatures.attackLaneSideExcessRoughness -
      weights.attackLaneShoulderPenalty * (nearbyT ? 1.5 : 1.0) *
          patternFeatures.attackLaneShoulderExcess -
      weights.competingWellPenalty * patternFeatures.competingWellUnits;
  const double wellSafety = std::clamp(
      static_cast<double>(15 - maximumHeight) / 7.0, 0.10, 1.0);
  // Only the positive Well reward fades with height. Deep/multiple-Well
  // penalties are constant throughout the game: the old signed multiplier
  // accidentally erased up to 90% of those penalties near the top.
  const double wellValue =
      (unownedHoleCells == 0 ? wellSafety * setupPriority : 0.0) *
          (iSupplyFactor * supportedWellValue + developingAttackLaneValue) +
      wellPenaltyValue;
  const double value =
      weights.boardStabilityMultiplier * dangerMultiplier * stabilityValue +
      completedSetupValue +
      tripleSetupValue +
      (donation
           ? setupPriority * weights.donationTemplateReward / (1 + donation->setup.size())
           : 0.0) +
      setupSafety * preparatorySetupValue +
      wellValue;
  return {value,
          maximumHeight,
          patternFeatures.completedTSpinDoublePatterns,
          patternFeatures.preTSpinDoublePatterns,
          aggregateHeight,
          holes,
          unownedHoleCells,
          coveredHoleDepth,
          patternFeatures.unfillableCavityCells,
          garbageCells,
          patternFeatures.attackLaneColumn,
          patternFeatures.attackLaneDepth,
          patternFeatures.attackLaneOccupiedCells,
          patternFeatures.attackLaneSideRoughness,
          patternFeatures.attackLaneSideExcessRoughness,
          patternFeatures.structuredWellDepth,
          patternFeatures.garbageRecoveryShaftDepth,
          patternFeatures.openWellCount,
          patternFeatures.openWellDepthSum,
          patternFeatures.openWellPieceDemand,
          patternFeatures.competingWellUnits,
          cleanForTSpinSetup,
          safeToPreserveTSpinSetup,
          patternFeatures.completedTSpinTriplePatterns,
          patternFeatures.reachableTSpinSlots,
          donation ? static_cast<int>(donation->setup.size()) : -1,
          patternFeatures.attackLaneShoulderExcess};
}

int donationLines(const Board& before, const PlacementOption& donor,
                  const BoardFeatures& current, const BoardFeatures& result,
                  const ExpertTAvailability& remainingT) noexcept {
  if (donor.linesCleared == 0 || !result.safeToPreserveTSpinSetup ||
      result.reachableTSpinSlots.empty() ||
      !(remainingT.inHold || (remainingT.exact && remainingT.movesUntilPiece <= 3)))
    return 0;

  // Map existing slots through the actual cleared rows. Merely shifting an
  // already reachable TSD down is not an unlock, even if its coordinates change.
  const Board locked = lockMino(before, donor.placement);
  std::array<bool, kBoardRows> removed{};
  for (int row = 0; row < kBoardRows; ++row) {
    removed[row] = std::all_of(locked.cells()[row].begin(),
                              locked.cells()[row].end(),
                              [](Cell cell) { return cell != Cell::Empty; });
  }
  int best = 0;
  for (const ActivePiece& slot : result.reachableTSpinSlots) {
    bool existed = false;
    for (ActivePiece old : current.reachableTSpinSlots) {
      // Preserve the entire three-row local shape, including its corners.
      if (removed[old.y] || removed[old.y + 1] || removed[old.y + 2]) continue;
      int shift = 0;
      for (int row = old.y + 3; row < kBoardRows; ++row)
        if (removed[row]) ++shift;
      old.y += shift;
      if (old == slot) { existed = true; break; }
    }
    if (!existed) best = std::max(best, slot.rotation == 2 ? 2 : 3);
  }
  // Several simultaneous slots do not multiply a single future T's value.
  return best;
}

bool isBackToBackUpdate(const PlacementOption& placement) noexcept {
  if (placement.linesCleared == 0) return false;
  // game-instance.ts checks the final clear type for Tetris, but checks the
  // detected T-Spin separately. Therefore a Tetris Perfect Clear breaks B2B,
  // while a T-Spin Perfect Clear keeps it.
  return placement.tSpin.has_value() ||
         (placement.linesCleared == 4 && !placement.perfectClear);
}

int backToBackAfter(const PlacementOption& placement,
                    int backToBackChain) noexcept {
  if (placement.linesCleared == 0) return backToBackChain;
  return isBackToBackUpdate(placement) ? backToBackChain + 1 : 0;
}

int garbageFor(const PlacementOption& placement,
               int backToBackChain) noexcept {
  if (placement.linesCleared == 0) return 0;
  if (placement.perfectClear) return 10;

  int garbage = 0;
  bool bonusEligible = false;
  if (placement.tSpin == TSpin::Full) {
    static constexpr std::array<int, 4> kTSpinGarbage{0, 2, 4, 6};
    garbage = kTSpinGarbage[static_cast<std::size_t>(
        std::min(placement.linesCleared, 3))];
    bonusEligible = placement.linesCleared >= 1 &&
                    placement.linesCleared <= 3;
  } else if (placement.tSpin == TSpin::Mini) {
    garbage = 1;
  } else {
    static constexpr std::array<int, 5> kLineGarbage{0, 0, 1, 2, 4};
    garbage = kLineGarbage[static_cast<std::size_t>(
        std::min(placement.linesCleared, 4))];
    bonusEligible = placement.linesCleared == 4;
  }
  if (backToBackChain > 0 && bonusEligible) ++garbage;
  return garbage;
}

double placementReward(const Board& boardBefore,
                       const PlacementOption& placement,
                       int backToBackChain,
                       const BoardFeatures& currentFeatures,
                       const BoardFeatures& resultFeatures,
                       const ExpertTAvailability& replacementT,
                       const ExpertIAvailability& replacementI,
                       const ExpertWeights& weights,
                       bool emergencyMode) noexcept {
  double reward = 0.0;
  const double heightUrgency = std::clamp(
      static_cast<double>(currentFeatures.maximumHeight - 11) / 4.0,
      0.0, 1.0);
  // Holes remain expensive at every height, but recovery mode itself is a
  // height-driven state. Triggering full recovery from a shallow garbage gap
  // made the versus agent abandon all attack construction too early.
  const double recoveryUrgency = emergencyMode ? 1.0 : heightUrgency;
  const double offenseFactor = emergencyMode ? 0.0 : 1.0;
  const int unlockedLines = donationLines(
      boardBefore, placement, currentFeatures, resultFeatures, replacementT);
  if (unlockedLines > 0) {
    const double arrivalFactor = replacementT.inHold ? 1.0 :
        1.0 - 0.15 * (replacementT.movesUntilPiece - 1);
    reward += offenseFactor * weights.donationUnlockReward * arrivalFactor *
              (unlockedLines / 2.0);
  }
  const bool multipleWellRecoveryMode =
      currentFeatures.openWellCount > 1;
  const bool successfulTSpin =
      placement.tSpin.has_value() && placement.linesCleared > 0;
  const bool tSpinSingle =
      placement.placement.type == PieceType::T &&
      placement.tSpin == TSpin::Full && placement.linesCleared == 1;
  int verticalIColumn = -1;
  if (placement.placement.type == PieceType::I) {
    if (placement.placement.rotation == 1) {
      verticalIColumn = placement.placement.x + 2;
    } else if (placement.placement.rotation == 3) {
      verticalIColumn = placement.placement.x + 1;
    }
  }
  const bool prematurePlannedIClear =
      verticalIColumn == currentFeatures.attackLaneColumn &&
      placement.linesCleared > 0 && placement.linesCleared < 4 &&
      currentFeatures.structuredWellDepth < 4 &&
      currentFeatures.garbageRecoveryShaftDepth < 3 &&
      currentFeatures.openWellCount <= 1 && !emergencyMode;
  if (prematurePlannedIClear) {
    reward -= 0.5 * weights.iCashoutDelayPenalty *
              (4 - placement.linesCleared);
  }
  if (placement.placement.type == PieceType::T && !successfulTSpin &&
      !placement.perfectClear) {
    const double safetyFactor = std::clamp(
        static_cast<double>(15 - resultFeatures.maximumHeight) / 5.0,
        0.10, 1.0);
    const bool repairsDamage =
        resultFeatures.unownedHoleCells < currentFeatures.unownedHoleCells ||
        resultFeatures.unfillableCavityCells < currentFeatures.unfillableCavityCells ||
        resultFeatures.coveredHoleDepth < currentFeatures.coveredHoleDepth ||
        (placement.linesCleared > 0 &&
         (resultFeatures.garbageCells < currentFeatures.garbageCells ||
          resultFeatures.openWellCount < currentFeatures.openWellCount ||
          currentFeatures.maximumHeight >= 11));
    const bool hasSafeSetup = currentFeatures.safeToPreserveTSpinSetup &&
        (currentFeatures.reachableTSpinDoublePatterns > 0 ||
         currentFeatures.preTSpinDoublePatterns > 0);
    const double purposeFactor = repairsDamage ? 0.15 : (hasSafeSetup ? 1.25 : 1.0);
    reward -= offenseFactor * weights.tWastedPenalty * purposeFactor *
              tWastedMultiplier(replacementT) * safetyFactor *
              (1.0 - 0.75 * recoveryUrgency);
  }
  const int destroyedTSpinDoublePatterns = std::max(
      0, currentFeatures.reachableTSpinDoublePatterns -
             resultFeatures.reachableTSpinDoublePatterns);
  const bool consumedByTSpinDouble =
      placement.placement.type == PieceType::T &&
      placement.tSpin == TSpin::Full && placement.linesCleared == 2;
  const bool consumedByTSpinTriple =
      placement.tSpin == TSpin::Full && placement.linesCleared == 3;
  const int destroyedTriplePatterns = std::max(
      0, currentFeatures.reachableTSpinTriplePatterns -
             resultFeatures.reachableTSpinTriplePatterns);
  const bool nearbyReplacementT = replacementT.inHold ||
      (replacementT.exact && replacementT.movesUntilPiece <= 3);
  if (!consumedByTSpinTriple && nearbyReplacementT &&
      currentFeatures.safeToPreserveTSpinSetup) {
    reward -= offenseFactor * weights.completedTSpinTripleBreakPenalty *
              destroyedTriplePatterns * (1.0 - 0.80 * recoveryUrgency);
  }
  if (destroyedTSpinDoublePatterns > 0 && !consumedByTSpinDouble &&
      currentFeatures.safeToPreserveTSpinSetup) {
    const double safetyFactor = std::clamp(
        static_cast<double>(16 - resultFeatures.maximumHeight) / 6.0,
        0.20, 1.0);
    double availabilityFactor = 0.75;
    if (replacementT.inHold) {
      availabilityFactor = 1.25;
    } else if (replacementT.exact) {
      availabilityFactor = std::clamp(
          1.25 - 0.05 * replacementT.movesUntilPiece, 0.85, 1.20);
    }
    reward -= offenseFactor * weights.completedTSpinDoubleBreakPenalty *
              destroyedTSpinDoublePatterns * safetyFactor *
              availabilityFactor * (1.0 - 0.80 * recoveryUrgency);
  }
  const int destroyedPreTSpinDoublePatterns = std::max(
      0, currentFeatures.preTSpinDoublePatterns -
             resultFeatures.preTSpinDoublePatterns);
  if (destroyedPreTSpinDoublePatterns > 0 && !consumedByTSpinDouble &&
      currentFeatures.cleanForTSpinSetup) {
    // BUILD_TSD is a real planning phase, not a disposable visual pattern.
    // Any move that abandons its base is penalized; an opportunistic TSS is
    // slightly worse because it also spends the once-per-bag T piece.
    const double tConsumptionFactor = tSpinSingle ? 1.25 : 1.0;
    reward -= offenseFactor * weights.preTSpinDoubleBreakPenalty *
              destroyedPreTSpinDoublePatterns * tConsumptionFactor;
  }

  const bool hasTSpinDoubleAlternative =
      currentFeatures.reachableTSpinDoublePatterns > 0 ||
      currentFeatures.preTSpinDoublePatterns > 0;
  const bool cleanTSpinDoubleBuildBoard =
      currentFeatures.maximumHeight <= 10 && currentFeatures.holes == 0 &&
      currentFeatures.openWellCount <= 1 &&
      currentFeatures.competingWellUnits == 0;
  if (tSpinSingle &&
      (hasTSpinDoubleAlternative || cleanTSpinDoubleBuildBoard) &&
      !emergencyMode) {
    // Compare attack per scarce T, not only attack on this placement.  A TSS
    // is still useful when it keeps B2B, when another T is already available,
    // or when the stack is becoming unsafe.  On a low, clean stack with the
    // replacement T far away it pays the full opportunity cost so that a TSD
    // construction can survive long enough to win at a later beam depth.
    const double safeBoardFactor = std::clamp(
        static_cast<double>(15 - currentFeatures.maximumHeight) / 7.0,
        0.0, 1.0);
    double scarcityFactor = 1.25;
    if (replacementT.inHold) {
      scarcityFactor = 0.25;
    } else if (replacementT.exact) {
      scarcityFactor = std::clamp(
          0.35 + 0.12 * replacementT.movesUntilPiece, 0.35, 1.15);
    }
    if (replacementT.visibleCount > 1) scarcityFactor *= 0.80;
    // On a low clean board, neither an existing B2B nor a nearby replacement
    // T justifies cashing out a local TSS. Preserve enough flat stack to build
    // the two-line slot; TSS remains available in recovery mode above.
    scarcityFactor = std::max(scarcityFactor, 0.85);
    const double wellRecoveryFactor = multipleWellRecoveryMode ? 0.20 : 1.0;
    const double activeBuildFactor =
        hasTSpinDoubleAlternative ? 1.25 : 1.0;
    reward -= offenseFactor * weights.tSpinSingleOpportunityPenalty *
              activeBuildFactor * safeBoardFactor * scarcityFactor *
              wellRecoveryFactor * (1.0 - 0.75 * recoveryUrgency);
  }

  const bool incomingI =
      replacementI.inHold ||
      (replacementI.exact && replacementI.movesUntilPiece <= 3);
  const int currentTetrisProgress = std::max(
      currentFeatures.structuredWellDepth,
      currentFeatures.attackLaneDepth);
  const int lostTetrisProgress = std::max(
      0, currentFeatures.attackLaneDepth - resultFeatures.attackLaneDepth);
  const int addedLaneObstructions = std::max(
      0, resultFeatures.attackLaneOccupiedCells -
             currentFeatures.attackLaneOccupiedCells);
  const bool cleanTetrisBuild =
      currentFeatures.openWellCount <= 1 &&
      currentFeatures.competingWellUnits == 0 &&
      currentFeatures.garbageRecoveryShaftDepth < 3;
  if (tSpinSingle && incomingI && currentTetrisProgress >= 2 &&
      cleanTetrisBuild && !emergencyMode) {
    // A line-clearing TSS consumes one of the four prepared rows even when it
    // does not visibly plug the lane. Explicit lane damage makes the penalty
    // larger. Once recovery mode starts, survival is allowed to override it.
    double arrivalFactor = 1.0;
    if (replacementI.inHold || replacementI.movesUntilPiece <= 1) {
      arrivalFactor = 1.30;
    } else if (replacementI.movesUntilPiece == 2) {
      arrivalFactor = 1.15;
    }
    const double progressFactor =
        0.50 + 0.25 * std::min(currentTetrisProgress, 4);
    const double damageFactor =
        1.0 + 0.50 * lostTetrisProgress +
        0.75 * addedLaneObstructions;
    reward -= offenseFactor * weights.tSpinSingleBlocksTetrisPenalty *
              arrivalFactor * progressFactor * damageFactor *
              (1.0 - 0.75 * recoveryUrgency);
  }

  // At low height, a temporary cavity can be an intentional T-Spin setup.
  // Once the stack is high, the same action becomes dangerous and is
  // penalized up to twenty times more strongly than at floor level.
  const double damageMultiplier = 0.15 + 2.85 * recoveryUrgency;
  const double recoveryMultiplier = 0.5 + 1.5 * recoveryUrgency;
  const int newHoles =
      std::max(0, resultFeatures.holes - currentFeatures.holes);
  const int newUnownedHoles = std::max(
      0, resultFeatures.unownedHoleCells -
             currentFeatures.unownedHoleCells);
  const int buriedHoleDepth = std::max(
      0, resultFeatures.coveredHoleDepth -
             currentFeatures.coveredHoleDepth);
  const int recoveredHoles =
      std::max(0, currentFeatures.holes - resultFeatures.holes);
  const int recoveredHoleDepth = std::max(
      0, currentFeatures.coveredHoleDepth -
             resultFeatures.coveredHoleDepth);
  const int newUnfillableCavityCells = std::max(
      0, resultFeatures.unfillableCavityCells -
             currentFeatures.unfillableCavityCells);
  const int recoveredUnfillableCavityCells = std::max(
      0, currentFeatures.unfillableCavityCells -
             resultFeatures.unfillableCavityCells);
  const int heightIncrease = std::max(
      0, resultFeatures.maximumHeight - currentFeatures.maximumHeight);
  const int heightRelief = std::max(
      0, currentFeatures.maximumHeight - resultFeatures.maximumHeight);
  const int garbageCellsCleared = std::max(
      0, currentFeatures.garbageCells - resultFeatures.garbageCells);
  const int newOpenWells = std::max(
      0, resultFeatures.openWellCount - currentFeatures.openWellCount);
  const int newCompetingWellUnits = std::max(
      0, resultFeatures.competingWellUnits -
             currentFeatures.competingWellUnits);
  const int openWellDepthRelief = std::max(
      0, currentFeatures.openWellDepthSum -
             resultFeatures.openWellDepthSum);
  const int openWellDemandRelief = std::max(
      0, currentFeatures.openWellPieceDemand -
             resultFeatures.openWellPieceDemand);
  reward -= weights.newHolePenalty * newHoles * damageMultiplier;
  // Low stacks may temporarily open a verified TSD cavity, but they must not
  // manufacture an unrelated side pocket to deepen the planned I Well.
  const int penalizedUnownedHoles = consumedByTSpinTriple
      // Cashing out can leave the old kick entrance. Losing its ownership
      // label is not the same as creating a new hole; normal hole evaluation
      // still penalizes the remaining cell and disables Well-building credit.
      ? std::min(newUnownedHoles, newHoles)
      : newUnownedHoles;
  reward -= weights.newUnownedHolePenalty * penalizedUnownedHoles;
  reward -= weights.buryHolePenalty * buriedHoleDepth * damageMultiplier;
  // A legal future spin/drop cannot repair these cells on the current board.
  // Treat creating one as a strategic invalid move even at low height, where
  // the ordinary hole damage multiplier is intentionally small for TSDs.
  reward -= weights.newUnfillableCavityPenalty *
            newUnfillableCavityCells;
  reward -= weights.heightIncreasePenalty * heightIncrease *
            (1.0 + recoveryUrgency);
  reward += weights.holeRecoveryReward *
            (2 * recoveredHoles + recoveredHoleDepth) *
            recoveryMultiplier;
  reward += weights.unfillableCavityRecoveryReward *
            recoveredUnfillableCavityCells * recoveryMultiplier;
  reward += weights.heightReliefReward * heightRelief *
            (1.0 + 1.5 * recoveryUrgency);
  reward += weights.garbageCellClearedReward * garbageCellsCleared *
            recoveryMultiplier;
  // Static evaluation makes existing extra Wells unattractive. This delta
  // penalty acts one move earlier: the order which first creates or deepens
  // a second valley loses before the valley can grow into a long shaft.
  reward -= weights.newCompetingWellPenalty *
            (2 * newOpenWells + newCompetingWellUnits) *
            (1.0 + recoveryUrgency);
  const int existingExtraWells =
      std::max(0, currentFeatures.openWellCount - 1);
  const int resultExtraWells =
      std::max(0, resultFeatures.openWellCount - 1);
  const int newExtraWells =
      std::max(0, resultExtraWells - existingExtraWells);
  reward -= weights.secondWellCreationPenalty * newExtraWells;

  const int resolvedOpenWells = std::max(
      0, currentFeatures.openWellCount - resultFeatures.openWellCount);
  const bool safeWellResolution =
      resolvedOpenWells > 0 && newHoles == 0 && buriedHoleDepth == 0;
  if (existingExtraWells > 0) {
    if (safeWellResolution) {
      reward += weights.multipleWellResolutionReward *
                std::min(existingExtraWells, resolvedOpenWells);
    } else {
      reward -= weights.multipleWellDelayPenalty * existingExtraWells;
    }
  }
  // A line clear which shortens an open Well or removes blocks above a buried
  // hole reduces future I demand. Do not reward merely roofing the Well: the
  // transition must clear a line without creating or burying another hole.
  if (placement.linesCleared > 0 && newHoles == 0 && buriedHoleDepth == 0) {
    const int availableIPieces = std::max(1, replacementI.visibleCount);
    const int supplyDeficit = std::max(
        0, currentFeatures.openWellPieceDemand - availableIPieces);
    const double wellUrgency =
        1.0 + 0.50 * supplyDeficit +
        0.25 * std::max(0, currentFeatures.openWellCount - 1);
    reward += weights.wellClearReliefReward *
              (openWellDepthRelief + recoveredHoleDepth) * wellUrgency;
    reward += weights.wellDemandReliefReward * openWellDemandRelief *
              wellUrgency;
  }
  const bool immediateIStillAvailable =
      replacementI.inHold ||
      (replacementI.exact && replacementI.movesUntilPiece <= 1);
  const int recoveryShaftDepth = std::max(
      {currentFeatures.structuredWellDepth,
       currentFeatures.garbageRecoveryShaftDepth,
       currentFeatures.openWellDepthSum});
  const double wellCashoutUrgency = std::max(
      recoveryUrgency,
      std::clamp(static_cast<double>(recoveryShaftDepth - 2) / 2.0,
                 0.0, 1.0));
  const bool mustCashOutI =
      currentFeatures.structuredWellDepth >= 4 ||
      currentFeatures.garbageRecoveryShaftDepth >= 3 ||
      currentFeatures.openWellCount > 1;
  if (placement.linesCleared == 0 && immediateIStillAvailable &&
      mustCashOutI) {
    reward -= weights.iCashoutDelayPenalty * wellCashoutUrgency;
  }

  if (placement.linesCleared == 0) return reward;

  const bool inefficientThreeLineClear =
      placement.linesCleared == 3 && !placement.tSpin.has_value() &&
      !emergencyMode && currentFeatures.maximumHeight <= 10 &&
      currentFeatures.holes == 0 && currentFeatures.openWellCount <= 1 &&
      currentFeatures.garbageRecoveryShaftDepth < 3;
  if (inefficientThreeLineClear) {
    // A clean low stack has time to complete the fourth Well row. Clearing
    // three now gives half a Tetris's attack and also forfeits its B2B clear.
    reward -= weights.inefficientThreeLinePenalty;
  }

  const int garbage = garbageFor(placement, backToBackChain);
  reward += offenseFactor * weights.garbageReward * garbage +
            weights.lineReward * placement.linesCleared;
  if (placement.tSpin == TSpin::Full) {
    if (placement.linesCleared == 1)
      reward += offenseFactor * weights.tSpinSingleReward;
    if (placement.linesCleared == 2)
      reward += offenseFactor * weights.tSpinDoubleReward;
    if (placement.linesCleared == 3)
      reward += offenseFactor * weights.tSpinTripleReward;
  } else if (placement.tSpin == TSpin::Mini) {
    reward += offenseFactor * weights.tSpinMiniReward;
  } else if (placement.linesCleared == 4) {
    reward += offenseFactor * weights.tetrisReward;
    const bool plannedLaneCashout =
        verticalIColumn == currentFeatures.attackLaneColumn;
    if (plannedLaneCashout) {
      const double heightCashoutUrgency = std::clamp(
          static_cast<double>(currentFeatures.maximumHeight - 8) / 4.0,
          0.0, 1.0);
      const double wellCashoutUrgency = std::clamp(
          static_cast<double>(currentFeatures.structuredWellDepth) / 4.0,
          0.0, 1.0);
      reward += offenseFactor * weights.tetrisCashoutReward *
                std::max(heightCashoutUrgency, wellCashoutUrgency);
    }
  }
  if (placement.perfectClear) reward += weights.perfectClearReward;

  if (!emergencyMode && !multipleWellRecoveryMode &&
      isBackToBackUpdate(placement)) {
    if (backToBackChain > 0) {
      const double chainValue =
          1.0 + 0.10 * std::min(backToBackChain, 10);
      reward += weights.backToBackContinuationReward * chainValue;
    } else {
      reward += weights.backToBackStartReward;
    }
  } else if (!emergencyMode && !multipleWellRecoveryMode &&
             backToBackChain > 0) {
    const double safeBoardFactor = std::clamp(
        static_cast<double>(15 - currentFeatures.maximumHeight) / 5.0,
        0.0, 1.0);
    const double chainValue =
        1.0 + 0.15 * std::min(backToBackChain, 10);
    reward -= weights.backToBackBreakPenalty *
              chainValue *
              (0.20 + 0.80 * safeBoardFactor) *
              (1.0 - 0.75 * recoveryUrgency);
  }
  return reward;
}

double routePriority(const PlacementOption& placement) noexcept {
  double priority = 1000.0 * garbageFor(placement, false) +
                    50.0 * placement.linesCleared;
  if (placement.tSpin == TSpin::Full && placement.linesCleared > 0) {
    priority += 250.0;
  }
  if (placement.perfectClear) priority += 3000.0;
  return priority;
}

std::vector<PlacementOption> enumeratePlacements(
    const Board& board, PieceType type, int spawnX, int spawnY,
    int spawnRotation, const SearchLimit& limit, bool& timedOut,
    std::uint64_t& nodesVisited, bool allowSoftDrop = true) {
  const ActivePiece spawn{type, spawnX, spawnY,
                          ((spawnRotation % 4) + 4) % 4};
  if (!isValidPosition(board, spawn)) return {};

  static constexpr std::array<Action, 6> kActions{
      Action::MoveLeft,         Action::MoveRight,
      Action::RotateClockwise, Action::RotateCounterClockwise,
      Action::Rotate180,       Action::SoftDrop,
  };

  std::queue<SearchNode> pending;
  std::set<SearchKey> visited;
  std::map<PlacementKey, PlacementOption> placements;
  pending.push({spawn, {}, -1});
  visited.insert({spawn.x, spawn.y, spawn.rotation, -1});

  while (!pending.empty()) {
    if ((nodesVisited & 63U) == 0U &&
        searchLimitReached(limit, nodesVisited)) {
      timedOut = true;
      return {};
    }
    SearchNode node = std::move(pending.front());
    pending.pop();
    ++nodesVisited;

    ActivePiece placement = node.piece;
    placement.y = calcGhostY(board, placement);
    const PlacementKey placementKey{placement.x, placement.y,
                                    placement.rotation};
    const ClearResult cleared = clearLines(lockMino(board, placement));
    const int lockKickIndex =
        placement.y == node.piece.y ? node.lastRotationKickIndex : -1;
    const std::optional<TSpin> tSpin =
        detectTSpin(board, placement, lockKickIndex >= 0, lockKickIndex,
                    cleared.linesCleared);
    const bool perfectClear =
        cleared.linesCleared > 0 && cleared.board.empty();
    std::vector<Action> actions = node.actions;
    actions.push_back(Action::HardDrop);
    PlacementOption option{placement, std::move(actions), cleared.board,
                           cleared.linesCleared, tSpin, perfectClear};

    const auto existing = placements.find(placementKey);
    if (existing == placements.end() ||
        routePriority(option) > routePriority(existing->second) ||
        (routePriority(option) == routePriority(existing->second) &&
         option.actions.size() < existing->second.actions.size())) {
      placements.insert_or_assign(placementKey, std::move(option));
    }

    for (const Action action : kActions) {
      if (!allowSoftDrop && action == Action::SoftDrop) continue;
      int nextKickIndex = -1;
      const std::optional<ActivePiece> next =
          applySearchAction(board, node.piece, action, &nextKickIndex);
      if (!next) continue;
      const SearchKey key{next->x, next->y, next->rotation,
                          nextKickIndex};
      if (!visited.insert(key).second) continue;
      std::vector<Action> nextActions = node.actions;
      nextActions.push_back(action);
      pending.push({*next, std::move(nextActions), nextKickIndex});
    }
  }

  std::vector<PlacementOption> result;
  result.reserve(placements.size());
  for (auto& [key, placement] : placements) {
    (void)key;
    result.push_back(std::move(placement));
  }
  return result;
}

std::optional<std::vector<Action>> directHardDropActions(
    const Board& board, const ActivePiece& spawn,
    const ActivePiece& target) {
  if (!isValidPosition(board, spawn)) return std::nullopt;

  static constexpr std::array<Action, 5> kDirectActions{
      Action::MoveLeft, Action::MoveRight, Action::RotateClockwise,
      Action::RotateCounterClockwise, Action::Rotate180,
  };
  using DirectKey = std::tuple<int, int, int>;
  std::queue<SearchNode> pending;
  std::set<DirectKey> visited;
  pending.push({spawn, {}, -1});
  visited.insert({spawn.x, spawn.y, spawn.rotation});

  while (!pending.empty()) {
    SearchNode node = std::move(pending.front());
    pending.pop();

    ActivePiece dropped = node.piece;
    dropped.y = calcGhostY(board, dropped);
    if (dropped == target) {
      node.actions.push_back(Action::HardDrop);
      return node.actions;
    }

    for (const Action action : kDirectActions) {
      int kickIndex = -1;
      const std::optional<ActivePiece> next =
          applySearchAction(board, node.piece, action, &kickIndex);
      if (!next) continue;
      const DirectKey key{next->x, next->y, next->rotation};
      if (!visited.insert(key).second) continue;
      std::vector<Action> actions = node.actions;
      actions.push_back(action);
      pending.push({*next, std::move(actions), kickIndex});
    }
  }
  return std::nullopt;
}

std::uint64_t hashBoard(const Board& board) noexcept {
  std::uint64_t hash = 1469598103934665603ULL;
  for (const Board::Row& row : board.cells()) {
    for (const Cell cell : row) {
      hash ^= static_cast<std::uint64_t>(cell) + 1U;
      hash *= 1099511628211ULL;
    }
  }
  return hash;
}

void hashCombine(std::uint64_t& hash, std::uint64_t value) noexcept {
  hash ^= value + 0x9e3779b97f4a7c15ULL + (hash << 6U) + (hash >> 2U);
}

std::uint64_t hashState(const BeamState& state) noexcept {
  std::uint64_t hash = hashBoard(state.board);
  hashCombine(hash, state.holdPiece
                        ? static_cast<std::uint64_t>(*state.holdPiece) + 1U
                        : 0U);
  hashCombine(hash, static_cast<std::uint64_t>(state.nextIndex));
  hashCombine(hash, static_cast<std::uint64_t>(state.backToBackChain));
  hashCombine(hash, static_cast<std::uint64_t>(state.attackLaneColumn));
  return hash;
}

std::vector<BeamState> selectBeamStates(
    std::vector<BeamState> candidates) {
  std::stable_sort(candidates.begin(), candidates.end(),
                   [](const BeamState& left, const BeamState& right) {
                     return left.rank > right.rank;
                   });

  std::vector<bool> selected(candidates.size(), false);
  std::unordered_set<std::uint64_t> seenStates;
  std::vector<std::size_t> selectedIndices;
  selectedIndices.reserve(std::min(kBeamWidth, candidates.size()));

  const auto trySelect = [&](std::size_t index) {
    if (selectedIndices.size() >= kBeamWidth || selected[index]) return false;
    if (!seenStates.insert(hashState(candidates[index])).second) return false;
    selected[index] = true;
    selectedIndices.push_back(index);
    return true;
  };

  for (std::size_t index = 0;
       index < candidates.size() && selectedIndices.size() < kBeamWidth;
       ++index) {
    trySelect(index);
  }

  std::vector<BeamState> result;
  result.reserve(selectedIndices.size());
  for (const std::size_t index : selectedIndices) {
    result.push_back(std::move(candidates[index]));
  }
  std::stable_sort(result.begin(), result.end(),
                   [](const BeamState& left, const BeamState& right) {
                     return left.rank > right.rank;
                   });
  return result;
}

std::size_t bestStateIndex(const std::vector<BeamState>& states) {
  return static_cast<std::size_t>(std::distance(
      states.begin(),
      std::max_element(states.begin(), states.end(),
                       [](const BeamState& left, const BeamState& right) {
                         return left.rank < right.rank;
                       })));
}

struct OpeningPattern {
  std::string_view name;
  bool continuation = false;
  bool mirrored = false;
  Board base;
  std::array<ActivePiece, 7> targets{};
  bool hasContinuation = false;
  int spinLines = 2;
};

OpeningPattern makeOpeningPattern(std::string_view name,
                                  const std::vector<std::string_view>& rows,
                                  ActivePiece t, bool continuation,
                                  bool anotherBag = false, int spinLines = 2) {
  OpeningPattern pattern;
  pattern.name = name;
  pattern.continuation = continuation;
  pattern.hasContinuation = !continuation || anotherBag;
  pattern.spinLines = spinLines;
  const int firstRow = kBoardRows - static_cast<int>(rows.size());
  for (int row = 0; row < static_cast<int>(rows.size()); ++row) {
    if (rows[row].size() != kBoardCols) throw std::logic_error("invalid opener row");
    for (int col = 0; col < kBoardCols; ++col)
      if (rows[row][col] == 'c') pattern.base.set(firstRow + row, col, Cell::Garbage);
  }
  for (int i = 0; i < 7; ++i) {
    const auto type = static_cast<PieceType>(i);
    if (type == PieceType::T && spinLines > 0) { pattern.targets[i] = t; continue; }
    int markerCount = 0;
    for (const auto row : rows)
      markerCount += static_cast<int>(std::count(row.begin(), row.end(), toString(type)[0]));
    if (markerCount != 4) throw std::logic_error("invalid opener piece count");
    bool found = false;
    for (int rotation = 0; rotation < 4 && !found; ++rotation) {
      for (int y = firstRow - 2; y < kBoardRows && !found; ++y) {
        for (int x = -2; x < kBoardCols && !found; ++x) {
          const ActivePiece candidate{type, x, y, rotation};
          const auto cells = getMinoCells(candidate);
          if (std::all_of(cells.begin(), cells.end(), [&](Point cell) {
                return cell.row >= firstRow && cell.row < kBoardRows &&
                       cell.col >= 0 && cell.col < kBoardCols &&
                       rows[cell.row - firstRow][cell.col] == toString(type)[0];
              })) {
            pattern.targets[i] = candidate;
            found = true;
          }
        }
      }
    }
    if (!found) throw std::logic_error("invalid opener piece geometry");
  }
  return pattern;
}

const std::vector<OpeningPattern>& openingPatterns() {
  // Honey Cup TD-PC geometry: https://tetristemplate.info/post-835/
  static const auto patterns = [] {
    std::vector<OpeningPattern> result{
        makeOpeningPattern("Honey-Cup/stack",
            {"L---------", "L------ZZ-", "LLT----JZZ", "OOTTSS-JJJ", "OOTSS-IIII"},
            {}, false, true, 0),
        makeOpeningPattern("Honey-Cup/TST-A1",
            {"------LLLI", "--ZJ--LOOI", "cZZJ---OOI", "cZJJSS-ccI",
             "cccSS--ccc", "cccccc-ccc", "ccccc-cccc"},
            {PieceType::T, 5, 36, 3}, true, true, 3),
        makeOpeningPattern("Honey-Cup/TST-A2",
            {"------IIII", "--OO--ZZLL", "cJOO---ZZL", "cJJJSS-ccL",
             "cccSS--ccc", "cccccc-ccc", "ccccc-cccc"},
            {PieceType::T, 5, 36, 3}, true, true, 3),
        makeOpeningPattern("Honey-Cup/TST-A3",
            {"------JJJI", "--LL--ZZJI", "cOOL---ZZI", "cOOLSS-ccI",
             "cccSS--ccc", "cccccc-ccc", "ccccc-cccc"},
            {PieceType::T, 5, 36, 3}, true, true, 3),
        makeOpeningPattern("Honey-Cup/TST-B",
            {"OO--------", "OO-------I", "LL-J--ZZ-I", "cL-J---ZZI", "cLJJSS-ccI",
             "cccSS--ccc", "cccccc-ccc", "ccccc-cccc"},
            {PieceType::T, 5, 36, 3}, true, true, 3),
    };
    const auto originals = result;
    for (auto pattern : originals) {
      pattern.mirrored = true;
      Board reflected;
      for (int row = 0; row < kBoardRows; ++row)
        for (int col = 0; col < kBoardCols; ++col)
          if (occupied(pattern.base, row, col)) reflected.set(row, 9 - col, Cell::Garbage);
      pattern.base = reflected;
      const auto targets = pattern.targets;
      for (const auto& target : targets) {
        auto mirrored = mirrorDonationPiece(target);
        mirrored.x += 7;  // helper reflects about x=1; the board axis is x=4.5
        pattern.targets[static_cast<int>(mirrored.type)] = mirrored;
      }
      result.push_back(std::move(pattern));
    }
    return result;
  }();
  return patterns;
}

bool sameBoardGeometry(const Board& left, const Board& right) {
  for (int row = 0; row < kBoardRows; ++row)
    for (int col = 0; col < kBoardCols; ++col)
      if (occupied(left, row, col) != occupied(right, row, col)) return false;
  return true;
}

std::optional<AgentDecision> openingRoute(
    const Board& board, const ActivePiece& target, const SearchLimit& limit,
    std::uint64_t& nodes, bool& timedOut, int spinLines = 2,
    bool allowClears = false) {
  if (!isValidPosition(board, target) || calcGhostY(board, target) != target.y)
    return std::nullopt;
  const bool spin = target.type == PieceType::T && spinLines > 0;
  const auto clear = clearLines(lockMino(board, target));
  if (!allowClears && clear.linesCleared != (spin ? spinLines : 0)) return std::nullopt;
  // Prefer direct drops for setup pieces; tucks remain legal when required.
  for (int pass = spin ? 1 : 0; pass < 2; ++pass) {
    std::queue<SearchNode> pending;
    std::set<SearchKey> visited;
    const ActivePiece spawn{target.type, 3, kSpawnY, 0};
    if (!isValidPosition(board, spawn)) return std::nullopt;
    pending.push({spawn, {}, -1});
    visited.insert({spawn.x, spawn.y, spawn.rotation, -1});
    while (!pending.empty()) {
      if (searchLimitReached(limit, nodes)) { timedOut = true; return std::nullopt; }
      auto node = std::move(pending.front());
      pending.pop();
      ++nodes;
      auto dropped = node.piece;
      dropped.y = calcGhostY(board, dropped);
      const int kick = dropped.y == node.piece.y ? node.lastRotationKickIndex : -1;
      if (dropped == target && (!spin ||
          detectTSpin(board, target, kick >= 0, kick, clear.linesCleared) == TSpin::Full)) {
        node.actions.push_back(Action::HardDrop);
        return AgentDecision{target, std::move(node.actions), 0.0, clear.linesCleared};
      }
      for (const Action action : {Action::MoveLeft, Action::MoveRight,
              Action::RotateClockwise, Action::RotateCounterClockwise,
              Action::Rotate180, Action::SoftDrop}) {
        if (pass == 0 && action == Action::SoftDrop) continue;
        int nextKick = -1;
        const auto next = applySearchAction(board, node.piece, action, &nextKick);
        if (!next || !visited.insert({next->x, next->y, next->rotation, nextKick}).second)
          continue;
        auto actions = node.actions;
        actions.push_back(action);
        pending.push({*next, std::move(actions), nextKick});
      }
    }
  }
  return std::nullopt;
}

// Exact bounded tiling search of the five rows after TST. Complete solutions
// are replayed through SRS before accepting them, including the TSD rotation.
std::optional<ExpertOpeningPlan> planTdPerfectClear(
    const DecisionContext& context, const std::vector<PieceType>& queue,
    bool mirrored, const SearchLimit& limit, std::uint64_t& nodes, bool& timedOut) {
  int filled = 0;
  for (int y = 0; y < kBoardRows; ++y)
    for (int x = 0; x < kBoardCols; ++x) if (occupied(context.board, y, x)) {
      if (y < kBoardRows - 5) return std::nullopt;
      ++filled;
    }
  if (filled != 26) return std::nullopt;
  struct Step { ActivePiece target; bool hold; };
  std::vector<Step> path;
  std::vector<AgentDecision> verified;
  std::uint64_t rejectedRoutes = 0;
  std::set<std::tuple<std::uint64_t, std::size_t, int, int, bool>> failed;
  const auto solve = [&](auto&& self, const Board& board, std::size_t index,
                         std::optional<PieceType> hold, int height, bool tsd) -> bool {
    if (searchLimitReached(limit, nodes)) { timedOut = true; return false; }
    ++nodes;
    if (board.empty()) {
      if (!tsd || path.size() != 6) return false;
      Board replay = context.board;
      verified.clear();
      for (const auto& step : path) {
        const auto clear = clearLines(lockMino(replay, step.target));
        auto route = openingRoute(replay, step.target, limit, nodes, timedOut,
                                  step.target.type == PieceType::T ? 2 : 0, true);
        if (!route) { ++rejectedRoutes; return false; }
        if (step.hold) route->actions.insert(route->actions.begin(), Action::Hold);
        verified.push_back(std::move(*route));
        replay = clear.board;
      }
      return true;
    }
    if (path.size() >= 6 || index >= queue.size()) return false;
    std::uint64_t bits = 0;
    for (int y = 0; y < 5; ++y)
      for (int x = 0; x < kBoardCols; ++x)
        if (occupied(board, kBoardRows - 5 + y, x)) bits |= 1ULL << (y * 10 + x);
    const auto key = std::make_tuple(bits, index, hold ? static_cast<int>(*hold) : -1, height, tsd);
    if (failed.count(key)) return false;
    const auto rejectedBefore = rejectedRoutes;
    const auto attempt = [&](PieceType type, bool useHold,
                             std::optional<PieceType> holdAfter, std::size_t nextIndex) {
      std::set<std::uint64_t> seen;
      for (int y = kBoardRows - 1; y >= kBoardRows - height - 2; --y)
        for (int x = -2; x < kBoardCols; ++x)
          for (int rotation = 0; rotation < 4; ++rotation) {
            if (searchLimitReached(limit, nodes)) { timedOut = true; return false; }
            ++nodes;
            const ActivePiece target{type, x, y, rotation};
            if (!isValidPosition(board, target) || calcGhostY(board, target) != y) continue;
            const auto cells = getMinoCells(target);
            if (std::any_of(cells.begin(), cells.end(), [&](Point p) {
                  return p.row < kBoardRows - height;
                })) continue;
            std::uint64_t footprint = 0;
            for (Point p : cells) footprint |= 1ULL << ((p.row - (kBoardRows - 5)) * 10 + p.col);
            if (type != PieceType::T && !seen.insert(footprint).second) continue;
            const auto clear = clearLines(lockMino(board, target));
            if (type == PieceType::T && (clear.linesCleared != 2 ||
                detectTSpin(board, target, true, 0, 2) != TSpin::Full)) continue;
            path.push_back({target, useHold});
            if (self(self, clear.board, nextIndex, holdAfter,
                     height - clear.linesCleared, tsd || type == PieceType::T)) return true;
            path.pop_back();
            if (timedOut) return false;
          }
      return false;
    };
    if (attempt(queue[index], false, hold, index + 1)) return true;
    if (!path.empty() || context.canHold) {
      if (hold && attempt(*hold, true, queue[index], index + 1)) return true;
      if (!hold && index + 1 < queue.size() &&
          attempt(queue[index + 1], true, queue[index], index + 2)) return true;
    }
    // Geometry-only failures are order-independent. Failed replay paths are
    // not: another order reaching this state can make an earlier tuck legal.
    if (rejectedBefore == rejectedRoutes && !timedOut) failed.insert(key);
    return false;
  };
  if (solve(solve, context.board, 0, context.hold, 5, false))
    return ExpertOpeningPlan{"TD/TSD-PC", mirrored, std::move(verified), false};
  return std::nullopt;
}

std::optional<ExpertOpeningPlan> planOpening(
    const DecisionContext& context, bool continuation, bool mirrored,
    const SearchLimit& limit, std::uint64_t& nodes, bool& timedOut) {
  if (context.garbageQueue > 0 || !context.garbageGapColumns.empty() ||
      context.spawnX != 3 || context.spawnY != kSpawnY || context.spawnRotation != 0)
    return std::nullopt;
  if (!continuation && (!context.board.empty() || context.hold)) return std::nullopt;

  // At either supported bag boundary, Hold + Active + Next describe one new
  // seven-bag. Deduce ONLY its final missing type when six distinct types are
  // visible. No random generation and no assumption about any subsequent bag.
  std::vector<PieceType> queue{context.active};
  const std::size_t queueLength = context.hold ? 6 : 7;
  for (const auto type : context.next) {
    if (queue.size() == queueLength) break;
    queue.push_back(type);
  }
  unsigned known = context.hold ? 1U << static_cast<int>(*context.hold) : 0;
  for (const auto type : queue) {
    const unsigned bit = 1U << static_cast<int>(type);
    if (known & bit) return std::nullopt;
    known |= bit;
  }
  if (queue.size() + (context.hold ? 1 : 0) == 6) {
    for (int i = 0; i < 7; ++i) if (!(known & (1U << i))) queue.push_back(static_cast<PieceType>(i));
  }
  if (queue.size() != queueLength) return std::nullopt;

  if (continuation) {
    auto pc = planTdPerfectClear(context, queue, mirrored, limit, nodes, timedOut);
    if (pc || timedOut) return pc;
  }

  for (const auto& pattern : openingPatterns()) {
    if (pattern.continuation != continuation ||
        (continuation && pattern.mirrored != mirrored) ||
        !sameBoardGeometry(context.board, pattern.base)) continue;
    std::set<std::tuple<unsigned, std::size_t, int>> failed;
    std::map<std::pair<unsigned, int>, std::optional<AgentDecision>> routes;
    std::vector<AgentDecision> path;
    const auto solve = [&](auto&& self, const Board& board, unsigned placed,
                           std::size_t index, std::optional<PieceType> hold) -> bool {
      if (searchLimitReached(limit, nodes)) { timedOut = true; return false; }
      if (placed == 127U) return true;
      const auto key = std::make_tuple(placed, index, hold ? static_cast<int>(*hold) : -1);
      if (failed.count(key)) return false;
      const auto attempt = [&](PieceType type, bool useHold,
                               std::optional<PieceType> holdAfter, std::size_t nextIndex) {
        const int typeIndex = static_cast<int>(type);
        const unsigned bit = 1U << typeIndex;
        if ((placed & bit) || (pattern.spinLines > 0 && type == PieceType::T && placed != (127U ^ bit))) return false;
        const auto routeKey = std::make_pair(placed, typeIndex);
        auto found = routes.find(routeKey);
        if (found == routes.end()) {
          auto route = openingRoute(board, pattern.targets[typeIndex], limit, nodes, timedOut, pattern.spinLines);
          found = routes.emplace(routeKey, std::move(route)).first;
        }
        if (!found->second) return false;
        auto decision = *found->second;
        if (useHold) decision.actions.insert(decision.actions.begin(), Action::Hold);
        const auto after = clearLines(lockMino(board, decision.placement)).board;
        path.push_back(std::move(decision));
        if (self(self, after, placed | bit, nextIndex, holdAfter)) return true;
        path.pop_back();
        return false;
      };
      if (index < queue.size()) {
        if (attempt(queue[index], false, hold, index + 1)) return true;
        if (!path.empty() || context.canHold) {
          if (hold && attempt(*hold, true, queue[index], index + 1)) return true;
          if (!hold && index + 1 < queue.size() &&
              attempt(queue[index + 1], true, queue[index], index + 2)) return true;
        }
      } else if (hold && placed == (127U ^ (1U << static_cast<int>(*hold)))) {
        // The next bag's active type is immaterial: immediately swap it for
        // the last held piece. Recheck its supply when executing the plan.
        if (attempt(*hold, true, std::nullopt, index)) return true;
      }
      failed.insert(key);
      return false;
    };
    if (solve(solve, context.board, 0, 0, context.hold))
      return ExpertOpeningPlan{pattern.name, pattern.mirrored, std::move(path),
                               pattern.hasContinuation};
    if (timedOut) break;
  }
  return std::nullopt;
}

bool openingMatchesVisibleSupply(const ExpertOpeningPlan& plan, std::size_t step,
                                 const DecisionContext& context) {
  std::vector<PieceType> queue{context.active};
  queue.insert(queue.end(), context.next.begin(), context.next.end());
  auto hold = context.hold;
  std::size_t index = 0;
  for (std::size_t i = step; i < plan.steps.size(); ++i) {
    if (index >= queue.size()) return true;  // recheck when this piece is visible
    auto active = queue[index++];
    if (plan.steps[i].actions.front() == Action::Hold) {
      if (i == step && !context.canHold) return false;
      const auto previous = hold;
      hold = active;
      if (previous) active = *previous;
      else {
        if (index >= queue.size()) return true;
        active = queue[index++];
      }
    }
    if (active != plan.steps[i].placement.type) return false;
  }
  return true;
}

double stateRank(double accumulatedReward, double futureWeight,
                 const BoardFeatures& features,
                 bool emergencyMode) noexcept {
  double rank = accumulatedReward + futureWeight * features.value;
  if (!emergencyMode) return rank;

  // Once the current board reaches the emergency threshold, make recovery
  // effectively lexicographic. One row of maximum-height relief dominates
  // attack, B2B, or any ordinary heuristic; aggregate height and buried holes
  // decide between states with the same ceiling.
  rank -= 1.0e9 * features.maximumHeight;
  rank -= 1.0e6 * features.aggregateHeight;
  rank -= 1.0e5 * features.holes;
  rank -= 1.0e4 * features.coveredHoleDepth;
  return rank;
}

}  // namespace

ExpertPatternFeatures extractExpertPatternFeatures(
    const Board& board) noexcept {
  return extractExpertPatternFeaturesWithHeights(
      board, columnHeights(board), -1, true);
}

ExpertTAvailability determineExpertTAvailability(
    std::optional<PieceType> holdPiece,
    const std::vector<PieceType>& nextPieces,
    std::size_t nextIndex) noexcept {
  return determinePieceAvailability(PieceType::T, holdPiece, nextPieces,
                                    nextIndex);
}

ExpertIAvailability determineExpertIAvailability(
    std::optional<PieceType> holdPiece,
    const std::vector<PieceType>& nextPieces,
    std::size_t nextIndex) noexcept {
  return determinePieceAvailability(PieceType::I, holdPiece, nextPieces,
                                    nextIndex);
}

ExpertBoardEvaluation evaluateExpertBoard(
    const Board& board, const ExpertWeights& weights,
    const ExpertTAvailability& tAvailability,
    const ExpertIAvailability& iAvailability) noexcept {
  return evaluateBoardForExpert(board, weights, tAvailability,
                                iAvailability);
}

std::optional<ExpertDonationPlan> findExpertDonationTemplate(
    const Board& board, std::optional<PieceType> hold,
    const std::vector<PieceType>& next, std::size_t nextIndex) {
  return findDonationTemplate(board, hold, next, nextIndex);
}

std::optional<ExpertOpeningPlan> findExpertOpeningPlan(
    const DecisionContext& context, bool continuation, bool mirrored) {
  std::uint64_t nodes = 0;
  bool timedOut = false;
  return planOpening(context, continuation, mirrored,
                     {Clock::now() + std::chrono::milliseconds(50), 50000},
                     nodes, timedOut);
}

int expertDonationLines(const Board& board, const ActivePiece& donor,
                        const ExpertTAvailability& remainingT) noexcept {
  if (!isValidPosition(board, donor) || calcGhostY(board, donor) != donor.y)
    return 0;
  const auto cleared = clearLines(lockMino(board, donor));
  const auto before = evaluateExpertBoard(board, {}, remainingT);
  const auto after = evaluateExpertBoard(cleared.board, {}, remainingT);
  const PlacementOption placement{donor, {}, cleared.board, cleared.linesCleared,
                                   std::nullopt, false};
  return donationLines(board, placement, before, after, remainingT);
}

ExpertAgent::ExpertAgent(std::chrono::milliseconds thinkTime,
                         ExpertWeights weights,
                         std::uint64_t maximumNodes)
    : thinkTime_(std::max(thinkTime, std::chrono::milliseconds(1))),
      weights_(std::move(weights)),
      maximumNodes_(maximumNodes) {}

std::string_view ExpertAgent::name() const noexcept { return "expert"; }

std::optional<AgentDecision> ExpertAgent::decide(
    const DecisionContext& context) {
  const Board& board = context.board;
  const PieceType type = context.active;
  const std::vector<PieceType>& nextPieces = context.next;
  const std::optional<PieceType> holdPiece = context.hold;
  const bool canHold = context.canHold;
  const int spawnX = context.spawnX;
  const int spawnY = context.spawnY;
  const int spawnRotation = context.spawnRotation;
  const int backToBackChain = std::max(0, context.backToBack);
  const std::vector<int> garbageGaps = projectedGarbageGaps(context);
  const std::optional<AgentDecision> fallback = decideEasy(
      board, type, spawnX, spawnY, spawnRotation, garbageGaps);
  if (!fallback) return std::nullopt;

  const SearchLimit limit{Clock::now() + thinkTime_, maximumNodes_};
  bool timedOut = false;
  std::uint64_t nodesVisited = 0;
  lastOpeningName_ = {};
  if (openingStage_ < 3) {
    const bool interrupted = context.garbageQueue > 0 || !garbageGaps.empty() ||
        spawnX != 3 || spawnY != kSpawnY || spawnRotation != 0 ||
        (openingExpectedBoard_ && !(*openingExpectedBoard_ == board));
    if (interrupted) {
      openingStage_ = 3;
      openingPlan_.reset();
    } else {
      if (!openingPlan_ && (openingStage_ == 0 || openingStage_ == 2)) {
        // Leave most of the decision budget for ordinary search on failure.
        const auto openingTime = std::min(std::chrono::milliseconds(25),
                                         std::max(std::chrono::milliseconds(1), thinkTime_ / 2));
        const SearchLimit openingLimit{
            std::min(limit.deadline, Clock::now() + openingTime),
            maximumNodes_ ? std::max<std::uint64_t>(1, maximumNodes_ / 2) : 0};
        bool openingTimedOut = false;
        openingPlan_ = planOpening(context, openingStage_ == 2, openingMirrored_,
                                   openingLimit, nodesVisited, openingTimedOut);
        if (openingPlan_) {
          openingStage_ = openingStage_ == 0 ? 1 : 2;
          openingMirrored_ = openingPlan_->mirrored;
          openingStep_ = 0;
        } else openingStage_ = 3;
      }
      if (openingPlan_) {
        if (!openingMatchesVisibleSupply(*openingPlan_, openingStep_, context)) {
          openingPlan_.reset();
          openingStage_ = 3;
        } else {
          AgentDecision decision = openingPlan_->steps[openingStep_];
          decision.completedDepth = static_cast<int>(openingPlan_->steps.size() - openingStep_);
          decision.nodesVisited = nodesVisited;
          lastOpeningName_ = openingPlan_->name;
          openingExpectedBoard_ = clearLines(lockMino(board, decision.placement)).board;
          if (++openingStep_ == openingPlan_->steps.size()) {
            openingStage_ = openingPlan_->hasContinuation ? 2 : 3;
            openingPlan_.reset();
          }
          return decision;
        }
      }
    }
  }
  std::vector<PlacementOption> currentPlacements = enumeratePlacements(
      board, type, spawnX, spawnY, spawnRotation, limit, timedOut,
      nodesVisited);
  if (timedOut || currentPlacements.empty()) {
    AgentDecision decision = *fallback;
    decision.nodesVisited = nodesVisited;
    decision.timedOut = timedOut;
    return decision;
  }

  std::vector<RootPlacement> rootPlacements;
  rootPlacements.reserve(currentPlacements.size() * 2U);
  for (PlacementOption& placement : currentPlacements) {
    const Board boardBeforeGarbage = placement.board;
    placement.board = applyPendingGarbage(placement.board, garbageGaps);
    rootPlacements.push_back(
        {std::move(placement), boardBeforeGarbage, holdPiece, 0});
  }

  if (canHold && (holdPiece || !nextPieces.empty())) {
    const PieceType heldActive = holdPiece ? *holdPiece : nextPieces.front();
    const std::size_t nextIndexAfterHold = holdPiece ? 0U : 1U;
    // HOLD respawns in TS at the spawn height from the request. Keeping y=0
    // here produced operation sequences that replayed 18 rows higher than the
    // TS internal spawn, especially before wall-side rotations.
    std::vector<PlacementOption> heldPlacements = enumeratePlacements(
        board, heldActive, 3, spawnY, 0, limit, timedOut, nodesVisited);
    if (timedOut) {
      AgentDecision decision = *fallback;
      decision.nodesVisited = nodesVisited;
      decision.timedOut = true;
      return decision;
    }
    for (PlacementOption& placement : heldPlacements) {
      const Board boardBeforeGarbage = placement.board;
      placement.board = applyPendingGarbage(placement.board, garbageGaps);
      placement.actions.insert(placement.actions.begin(), Action::Hold);
      rootPlacements.push_back(
          {std::move(placement), boardBeforeGarbage, type,
           nextIndexAfterHold});
    }
  }

  const ExpertTAvailability initialT =
      determineExpertTAvailability(holdPiece, nextPieces);
  const ExpertIAvailability initialI =
      determineExpertIAvailability(holdPiece, nextPieces);
  std::vector<PieceType> initialQueue{type};
  initialQueue.insert(initialQueue.end(), nextPieces.begin(), nextPieces.end());
  // Compare both orientations: 3-6, 4-5, 5-4 and 6-3. Select once when
  // ordinary search begins (including after an opener), then keep the lane
  // until the board is empty again to avoid building competing Wells.
  const std::array<int, 4> openingAttackLanes{3, 4, 5, 6};
  const bool chooseOpeningLane =
      board.empty() || !isStructuredWellColumn(attackLaneColumn_);
  const BoardFeatures emergencyFeatures =
      evaluateBoardForExpert(board, weights_, initialT, initialI,
                             attackLaneColumn_);
  const bool emergencyMode =
      emergencyFeatures.maximumHeight >= kEmergencyHeight;
  std::vector<BeamState> layer;
  const int laneCount = chooseOpeningLane
                            ? static_cast<int>(openingAttackLanes.size()) : 1;
  layer.reserve(rootPlacements.size() * laneCount);
  std::array<BoardFeatures, openingAttackLanes.size()> initialFeaturesByLane;
  for (int i = 0; i < laneCount; ++i) {
    initialFeaturesByLane[i] = evaluateBoardForExpert(
        board, weights_, initialT, initialI,
        chooseOpeningLane ? openingAttackLanes[i] : attackLaneColumn_,
        canHold ? &initialQueue : nullptr, holdPiece);
  }
  for (std::size_t index = 0; index < rootPlacements.size(); ++index) {
    const RootPlacement& root = rootPlacements[index];
    for (int laneIndex = 0; laneIndex < laneCount; ++laneIndex) {
      const int attackLane = chooseOpeningLane
                                 ? openingAttackLanes[laneIndex]
                                 : attackLaneColumn_;
      const ExpertTAvailability replacementT = determineExpertTAvailability(
          root.holdPiece, nextPieces, root.nextIndex);
      const ExpertIAvailability replacementI = determineExpertIAvailability(
          root.holdPiece, nextPieces, root.nextIndex);
      const BoardFeatures& initialFeatures = initialFeaturesByLane[laneIndex];
      const BoardFeatures features = evaluateBoardForExpert(
          root.placement.board, weights_, replacementT, replacementI,
          attackLane, &nextPieces, root.holdPiece, root.nextIndex);
      const BoardFeatures rewardFeatures = garbageGaps.empty() ? features : evaluateBoardForExpert(
          root.boardBeforeGarbage, weights_, replacementT, replacementI,
          attackLane, &nextPieces, root.holdPiece, root.nextIndex);
      const double reward = placementReward(
          board, root.placement, backToBackChain, initialFeatures, rewardFeatures,
          replacementT, replacementI, weights_, emergencyMode);
      layer.push_back({root.placement.board,
                       reward,
                       stateRank(reward, kFutureDiscount, features,
                                 emergencyMode),
                       index,
                       root.holdPiece,
                       root.nextIndex,
                       backToBackAfter(root.placement, backToBackChain),
                       attackLane,
                       features});
    }
  }
  layer = selectBeamStates(std::move(layer));

  std::size_t bestFirstPlacement = layer[bestStateIndex(layer)].firstPlacement;
  int bestAttackLane = layer[bestStateIndex(layer)].attackLaneColumn;
  double bestRank = layer[bestStateIndex(layer)].rank;
  int completedDepth = 1;
  double discount = kFutureDiscount;

  for (std::size_t depth = 1; depth <= nextPieces.size(); ++depth) {
    if (searchLimitReached(limit, nodesVisited)) {
      timedOut = true;
      break;
    }
    const bool everyStateHasNext =
        std::all_of(layer.begin(), layer.end(), [&](const BeamState& state) {
          return state.nextIndex < nextPieces.size();
        });
    if (!everyStateHasNext) break;

    std::vector<BeamState> candidates;
    candidates.reserve(layer.size() * 48U);
    bool incompleteDepth = false;

    for (const BeamState& state : layer) {
      const PieceType activeType = nextPieces[state.nextIndex];
      auto addPlacements = [&](PieceType pieceToPlace,
                               std::optional<PieceType> holdAfter,
                               std::size_t nextIndexAfter) {
        std::vector<PlacementOption> placements = enumeratePlacements(
            state.board, pieceToPlace, 3, kSpawnY, 0, limit, timedOut,
            nodesVisited, pieceToPlace == PieceType::T ||
                              state.features.donationSetupPieces >= 0);
        if (timedOut) return;
        for (const PlacementOption& placement : placements) {
          const ExpertTAvailability replacementT =
              determineExpertTAvailability(holdAfter, nextPieces,
                                           nextIndexAfter);
          const ExpertIAvailability replacementI =
              determineExpertIAvailability(holdAfter, nextPieces,
                                           nextIndexAfter);
          const BoardFeatures features =
              evaluateBoardForExpert(placement.board, weights_, replacementT,
                                     replacementI,
                                     state.attackLaneColumn, &nextPieces,
                                     holdAfter, nextIndexAfter);
          const double moveReward = placementReward(
              state.board, placement, state.backToBackChain, state.features, features,
              replacementT, replacementI, weights_, emergencyMode);
          const double accumulatedReward =
              state.accumulatedReward + discount * moveReward;
          candidates.push_back(
              {placement.board,
               accumulatedReward,
               stateRank(accumulatedReward,
                         discount * kFutureDiscount, features,
                         emergencyMode),
               state.firstPlacement,
               holdAfter,
               nextIndexAfter,
               backToBackAfter(placement, state.backToBackChain),
               state.attackLaneColumn,
               features});
        }
      };

      addPlacements(activeType, state.holdPiece, state.nextIndex + 1U);
      if (timedOut) {
        incompleteDepth = true;
        break;
      }
      if (state.holdPiece) {
        addPlacements(*state.holdPiece, activeType, state.nextIndex + 1U);
      } else if (state.nextIndex + 1U < nextPieces.size()) {
        addPlacements(nextPieces[state.nextIndex + 1U], activeType,
                      state.nextIndex + 2U);
      }
      if (timedOut) {
        incompleteDepth = true;
        break;
      }
    }
    if (incompleteDepth || candidates.empty()) break;

    std::vector<BeamState> nextLayer =
        selectBeamStates(std::move(candidates));
    if (nextLayer.empty()) break;

    layer = std::move(nextLayer);
    const std::size_t bestIndex = bestStateIndex(layer);
    bestFirstPlacement = layer[bestIndex].firstPlacement;
    bestAttackLane = layer[bestIndex].attackLaneColumn;
    bestRank = layer[bestIndex].rank;
    ++completedDepth;
    discount *= kFutureDiscount;
  }

  const PlacementOption& best = rootPlacements[bestFirstPlacement].placement;
  attackLaneColumn_ = bestAttackLane;
  std::vector<Action> finalActions = best.actions;
  if (best.placement.type == PieceType::T && best.linesCleared == 0) {
    const bool usedHold =
        !finalActions.empty() && finalActions.front() == Action::Hold;
    const ActivePiece directSpawn{
        PieceType::T, usedHold ? 3 : spawnX, spawnY,
        usedHold ? 0 : spawnRotation};
    if (std::optional<std::vector<Action>> direct =
            directHardDropActions(board, directSpawn, best.placement)) {
      finalActions = std::move(*direct);
      if (usedHold) finalActions.insert(finalActions.begin(), Action::Hold);
    }
  }
  return AgentDecision{best.placement,
                       std::move(finalActions),
                       -bestRank,
                       best.linesCleared,
                       completedDepth,
                       nodesVisited,
                       timedOut};
}

}  // namespace tetris
