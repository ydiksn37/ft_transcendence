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
#include <tuple>
#include <unordered_set>
#include <utility>
#include <vector>

namespace tetris {
namespace {

using Clock = std::chrono::steady_clock;
using Deadline = Clock::time_point;

constexpr std::size_t kBeamWidth = 20;
constexpr double kFutureDiscount = 0.94;
constexpr int kMaximumSevenBagTDistance = 13;

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
  bool backToBackActive = false;
  int maximumHeight = 0;
  int reachableTSpinDoublePatterns = 0;
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

bool canReachTSpinDouble(const Board& board,
                         const ActivePiece& target,
                         int linesCleared) {
  if (linesCleared != 2 || calcGhostY(board, target) != target.y) return false;

  const ActivePiece spawn{PieceType::T, 3, kSpawnY, 0};
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
      if (isRotationAction(action) && *next == target &&
          detectTSpin(board, *next, true, kickIndex, linesCleared) ==
              TSpin::Full) {
        return true;
      }
      const ReachabilityKey key{next->x, next->y, next->rotation};
      if (visited.insert(key).second) pending.push(*next);
    }
  }
  return false;
}

int readyTSpinDoubleLines(const Board& board, int row, int col) noexcept {
  const ActivePiece tPiece{PieceType::T, col, row, 2};
  if (!isValidPosition(board, tPiece) || calcGhostY(board, tPiece) != row) {
    return 0;
  }
  const int lines = clearLines(lockMino(board, tPiece)).linesCleared;
  if (!canReachTSpinDouble(board, tPiece, lines)) return 0;
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

std::array<int, 5> wellDistanceFeature(
    const std::array<int, kBoardCols>& heights) noexcept {
  int bestColumn = -1;
  int bestDepth = 0;
  for (int col = 0; col < kBoardCols; ++col) {
    const int leftHeight = col == 0 ? kBoardRows : heights[col - 1];
    const int rightHeight =
        col + 1 == kBoardCols ? kBoardRows : heights[col + 1];
    const int depth = std::min(leftHeight, rightHeight) - heights[col];
    if (depth > bestDepth) {
      bestDepth = depth;
      bestColumn = col;
    }
  }

  std::array<int, 5> result{};
  if (bestColumn >= 0) {
    const int distance =
        std::min(bestColumn, kBoardCols - 1 - bestColumn);
    result[static_cast<std::size_t>(distance)] = 1;
  }
  return result;
}

ExpertPatternFeatures extractExpertPatternFeaturesWithHeights(
    const Board& board,
    const std::array<int, kBoardCols>& heights) noexcept {
  ExpertPatternFeatures features;
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
          ++features.completedTSpinDoublePatterns;
          features.completedTSpinDoubleLines += lines;
        }
      }
    }
  }
  features.wellDistance = wellDistanceFeature(heights);
  return features;
}

double completedPatternMultiplier(
    const ExpertTAvailability& availability) noexcept {
  if (!availability.exact) return 0.98;
  if (availability.inHold) return 1.05;
  if (availability.movesUntilT <= 1) return 1.03;
  if (availability.movesUntilT == 2) return 1.02;
  if (availability.movesUntilT <= 4) return 1.00;
  if (availability.movesUntilT <= 6) return 0.99;
  return 0.98;
}

double prePatternMultiplier(
    const ExpertTAvailability& availability) noexcept {
  if (!availability.exact) return 0.98;
  if (availability.inHold) return 1.00;
  if (availability.movesUntilT == 1) return 0.99;
  if (availability.movesUntilT == 2) return 1.05;
  if (availability.movesUntilT == 3) return 1.04;
  if (availability.movesUntilT == 4) return 1.02;
  if (availability.movesUntilT <= 6) return 1.00;
  return 0.99;
}

double tWastedMultiplier(
    const ExpertTAvailability& replacementT) noexcept {
  if (!replacementT.exact) return 1.05;
  if (replacementT.inHold) return 0.90;
  if (replacementT.movesUntilT <= 2) return 0.95;
  if (replacementT.movesUntilT <= 5) return 1.00;
  return 1.03;
}

BoardFeatures evaluateBoardForExpert(const Board& board,
                                     const ExpertWeights& weights,
                                     const ExpertTAvailability& availability)
    noexcept {
  std::array<int, kBoardCols> heights{};
  int aggregateHeight = 0;
  int maximumHeight = 0;
  int holes = 0;
  int coveredHoleDepth = 0;
  int bumpiness = 0;
  int rowTransitions = 0;
  int columnTransitions = 0;

  for (int col = 0; col < kBoardCols; ++col) {
    int top = kBoardRows;
    int blocksAbove = 0;
    bool previousOccupied = false;
    for (int row = 0; row < kBoardRows; ++row) {
      const bool occupied = board.cells()[row][col] != Cell::Empty;
      if (occupied) {
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

  std::array<int, kBoardCols> wellStreak{};
  int deepestWell = 0;
  int deepestEdgeWell = 0;
  for (int row = kBoardRows - 1; row >= 0; --row) {
    int emptyCount = 0;
    int emptyColumn = -1;
    for (int col = 0; col < kBoardCols; ++col) {
      if (board.cells()[row][col] == Cell::Empty) {
        ++emptyCount;
        emptyColumn = col;
      }
    }
    for (int col = 0; col < kBoardCols; ++col) {
      if (emptyCount == 1 && emptyColumn == col) {
        ++wellStreak[col];
        deepestWell = std::max(deepestWell, wellStreak[col]);
        if (col == 0 || col == kBoardCols - 1) {
          deepestEdgeWell = std::max(deepestEdgeWell, wellStreak[col]);
        }
      } else {
        wellStreak[col] = 0;
      }
    }
  }

  const ExpertPatternFeatures patternFeatures =
      extractExpertPatternFeaturesWithHeights(board, heights);
  // A 7-bag supplies only one T. Stop adding completed-slot reward at the
  // third simultaneous TSD; ordinary hole/height penalties then make excess
  // reservations unattractive. In danger, reserve room for only one slot.
  const int setupLimit = maximumHeight >= 12 ? 1 : 2;
  const int rewardedCompletedLines = std::min(
      patternFeatures.completedTSpinDoubleLines, 2 * setupLimit);
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
  const double completedSetupValue =
      weights.readyTSpinDoubleReward *
          patternFeatures.completedTSpinDoublePatterns +
      weights.completedTSpinDoublePatternReward * rewardedCompletedLines *
          completedPatternMultiplier(availability);
  const double preparatorySetupValue =
      weights.preTSpinDoubleReward *
          patternFeatures.preTSpinDoublePatterns *
          prePatternMultiplier(availability) +
      wellDistanceValue;
  const double wellValue =
      weights.wellReward * deepestWell * deepestWell +
      weights.edgeWellReward * deepestEdgeWell * deepestEdgeWell;
  const double value =
      weights.boardStabilityMultiplier * dangerMultiplier * stabilityValue +
      completedSetupValue + setupSafety * preparatorySetupValue +
      (0.65 + 0.35 * setupSafety) * wellValue;
  return {value, maximumHeight,
          patternFeatures.completedTSpinDoublePatterns};
}

bool isBackToBackUpdate(const PlacementOption& placement) noexcept {
  if (placement.linesCleared == 0) return false;
  // game-instance.ts checks the final clear type for Tetris, but checks the
  // detected T-Spin separately. Therefore a Tetris Perfect Clear breaks B2B,
  // while a T-Spin Perfect Clear keeps it.
  return placement.tSpin.has_value() ||
         (placement.linesCleared == 4 && !placement.perfectClear);
}

bool backToBackAfter(const PlacementOption& placement,
                     bool backToBackActive) noexcept {
  if (placement.linesCleared == 0) return backToBackActive;
  return isBackToBackUpdate(placement);
}

int garbageFor(const PlacementOption& placement,
               bool backToBackActive) noexcept {
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
  if (backToBackActive && bonusEligible) ++garbage;
  return garbage;
}

double placementReward(const PlacementOption& placement,
                       bool backToBackActive,
                       int currentMaximumHeight,
                       int resultMaximumHeight,
                       int currentReachableTSpinDoublePatterns,
                       int resultReachableTSpinDoublePatterns,
                       const ExpertTAvailability& replacementT,
                       const ExpertWeights& weights) noexcept {
  double reward = 0.0;
  if (placement.placement.type == PieceType::T && !placement.tSpin) {
    const double safetyFactor = std::clamp(
        static_cast<double>(15 - resultMaximumHeight) / 5.0, 0.10, 1.0);
    reward -= weights.tWastedPenalty * tWastedMultiplier(replacementT) *
              safetyFactor;
  }
  const int destroyedTSpinDoublePatterns = std::max(
      0, currentReachableTSpinDoublePatterns -
             resultReachableTSpinDoublePatterns);
  const bool consumedByTSpinDouble =
      placement.placement.type == PieceType::T &&
      placement.tSpin == TSpin::Full && placement.linesCleared == 2;
  if (destroyedTSpinDoublePatterns > 0 && !consumedByTSpinDouble) {
    const double safetyFactor = std::clamp(
        static_cast<double>(16 - resultMaximumHeight) / 6.0, 0.20, 1.0);
    double availabilityFactor = 0.75;
    if (replacementT.inHold) {
      availabilityFactor = 1.25;
    } else if (replacementT.exact) {
      availabilityFactor = std::clamp(
          1.25 - 0.05 * replacementT.movesUntilT, 0.85, 1.20);
    }
    reward -= weights.completedTSpinDoubleBreakPenalty *
              destroyedTSpinDoublePatterns * safetyFactor *
              availabilityFactor;
  }
  if (placement.linesCleared == 0) return reward;

  const int garbage = garbageFor(placement, backToBackActive);
  reward += weights.garbageReward * garbage +
            weights.lineReward * placement.linesCleared;

  if (placement.tSpin == TSpin::Full) {
    if (placement.linesCleared == 1) reward += weights.tSpinSingleReward;
    if (placement.linesCleared == 2) reward += weights.tSpinDoubleReward;
    if (placement.linesCleared == 3) reward += weights.tSpinTripleReward;
  } else if (placement.tSpin == TSpin::Mini) {
    reward += weights.tSpinMiniReward;
  }
  if (placement.perfectClear) reward += weights.perfectClearReward;

  if (isBackToBackUpdate(placement)) {
    reward += backToBackActive ? weights.backToBackContinuationReward
                               : weights.backToBackStartReward;
  } else if (backToBackActive) {
    const double safeBoardFactor = std::clamp(
        static_cast<double>(15 - currentMaximumHeight) / 5.0, 0.0, 1.0);
    reward -= weights.backToBackBreakPenalty *
              (0.20 + 0.80 * safeBoardFactor);
  }
  return reward;
}

double routePriority(const PlacementOption& placement) noexcept {
  double priority = 1000.0 * garbageFor(placement, false) +
                    50.0 * placement.linesCleared;
  if (placement.tSpin == TSpin::Full) priority += 250.0;
  if (placement.perfectClear) priority += 3000.0;
  return priority;
}

std::vector<PlacementOption> enumeratePlacements(
    const Board& board, PieceType type, int spawnX, int spawnY,
    int spawnRotation, const SearchLimit& limit, bool& timedOut,
    std::uint64_t& nodesVisited) {
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
  hashCombine(hash, state.backToBackActive ? 1U : 0U);
  return hash;
}

std::size_t bestStateIndex(const std::vector<BeamState>& states) {
  return static_cast<std::size_t>(std::distance(
      states.begin(),
      std::max_element(states.begin(), states.end(),
                       [](const BeamState& left, const BeamState& right) {
                         return left.rank < right.rank;
                       })));
}

}  // namespace

ExpertPatternFeatures extractExpertPatternFeatures(
    const Board& board) noexcept {
  return extractExpertPatternFeaturesWithHeights(board, columnHeights(board));
}

ExpertTAvailability determineExpertTAvailability(
    std::optional<PieceType> holdPiece,
    const std::vector<PieceType>& nextPieces,
    std::size_t nextIndex) noexcept {
  if (holdPiece == PieceType::T) return {0, true, true};
  for (std::size_t index = nextIndex; index < nextPieces.size(); ++index) {
    if (nextPieces[index] == PieceType::T) {
      return {static_cast<int>(index - nextIndex + 1U), false, true};
    }
  }
  return {kMaximumSevenBagTDistance, false, false};
}

ExpertBoardEvaluation evaluateExpertBoard(
    const Board& board, const ExpertWeights& weights,
    const ExpertTAvailability& availability) noexcept {
  return evaluateBoardForExpert(board, weights, availability);
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
  const bool backToBackActive = context.backToBack > 0;
  const std::vector<int> garbageGaps = projectedGarbageGaps(context);
  const std::optional<AgentDecision> fallback = decideEasy(
      board, type, spawnX, spawnY, spawnRotation, garbageGaps);
  if (!fallback) return std::nullopt;

  const SearchLimit limit{Clock::now() + thinkTime_, maximumNodes_};
  bool timedOut = false;
  std::uint64_t nodesVisited = 0;
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
    placement.board = applyPendingGarbage(placement.board, garbageGaps);
    rootPlacements.push_back({std::move(placement), holdPiece, 0});
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
      placement.board = applyPendingGarbage(placement.board, garbageGaps);
      placement.actions.insert(placement.actions.begin(), Action::Hold);
      rootPlacements.push_back(
          {std::move(placement), type, nextIndexAfterHold});
    }
  }

  const ExpertTAvailability initialT =
      determineExpertTAvailability(holdPiece, nextPieces);
  const BoardFeatures initialFeatures =
      evaluateBoardForExpert(board, weights_, initialT);
  std::vector<BeamState> layer;
  layer.reserve(rootPlacements.size());
  for (std::size_t index = 0; index < rootPlacements.size(); ++index) {
    const RootPlacement& root = rootPlacements[index];
    const ExpertTAvailability replacementT = determineExpertTAvailability(
        root.holdPiece, nextPieces, root.nextIndex);
    const BoardFeatures features =
        evaluateBoardForExpert(root.placement.board, weights_, replacementT);
    const int dangerHeight = garbageGaps.empty()
                                 ? initialFeatures.maximumHeight
                                 : features.maximumHeight;
    const double reward = placementReward(
        root.placement, backToBackActive, dangerHeight,
        features.maximumHeight,
        initialFeatures.reachableTSpinDoublePatterns,
        features.reachableTSpinDoublePatterns, replacementT, weights_);
    layer.push_back({root.placement.board,
                     reward,
                     reward + kFutureDiscount * features.value,
                     index,
                     root.holdPiece,
                     root.nextIndex,
                     backToBackAfter(root.placement, backToBackActive),
                     features.maximumHeight,
                     features.reachableTSpinDoublePatterns});
  }
  std::stable_sort(layer.begin(), layer.end(),
                   [](const BeamState& left, const BeamState& right) {
                     return left.rank > right.rank;
                   });
  if (layer.size() > kBeamWidth) layer.resize(kBeamWidth);

  std::size_t bestFirstPlacement = layer[bestStateIndex(layer)].firstPlacement;
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
            state.board, pieceToPlace, 3, 0, 0, limit, timedOut,
            nodesVisited);
        if (timedOut) return;
        for (const PlacementOption& placement : placements) {
          const ExpertTAvailability replacementT =
              determineExpertTAvailability(holdAfter, nextPieces,
                                           nextIndexAfter);
          const BoardFeatures features =
              evaluateBoardForExpert(placement.board, weights_, replacementT);
          const double moveReward = placementReward(
              placement, state.backToBackActive, state.maximumHeight,
              features.maximumHeight,
              state.reachableTSpinDoublePatterns,
              features.reachableTSpinDoublePatterns, replacementT, weights_);
          const double accumulatedReward =
              state.accumulatedReward + discount * moveReward;
          candidates.push_back(
              {placement.board,
               accumulatedReward,
               accumulatedReward +
                   discount * kFutureDiscount * features.value,
               state.firstPlacement,
               holdAfter,
               nextIndexAfter,
               backToBackAfter(placement, state.backToBackActive),
               features.maximumHeight,
               features.reachableTSpinDoublePatterns});
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

    std::stable_sort(candidates.begin(), candidates.end(),
                     [](const BeamState& left, const BeamState& right) {
                       return left.rank > right.rank;
                     });
    std::unordered_set<std::uint64_t> seenStates;
    std::vector<BeamState> nextLayer;
    nextLayer.reserve(std::min(kBeamWidth, candidates.size()));
    for (BeamState& candidate : candidates) {
      if (!seenStates.insert(hashState(candidate)).second) continue;
      nextLayer.push_back(std::move(candidate));
      if (nextLayer.size() == kBeamWidth) break;
    }
    if (nextLayer.empty()) break;

    layer = std::move(nextLayer);
    const std::size_t bestIndex = bestStateIndex(layer);
    bestFirstPlacement = layer[bestIndex].firstPlacement;
    bestRank = layer[bestIndex].rank;
    ++completedDepth;
    discount *= kFutureDiscount;
  }

  const PlacementOption& best = rootPlacements[bestFirstPlacement].placement;
  return AgentDecision{best.placement,
                       best.actions,
                       -bestRank,
                       best.linesCleared,
                       completedDepth,
                       nodesVisited,
                       timedOut};
}

}  // namespace tetris
