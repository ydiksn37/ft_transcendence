#include "tetris/hard_agent.hpp"

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

// Hard is intentionally a middle tier: it searches several pieces with a
// modest beam, but does not carry Expert's attack structures, bag planning,
// or B2B state through the tree.
constexpr std::size_t kBeamWidth = 10;
constexpr int kMaximumSearchDepth = 3;
constexpr double kFutureDiscount = 0.92;
constexpr double kCreatedHolePenalty = 12000.0;

struct SearchNode {
  ActivePiece piece;
  std::vector<Action> actions;
};

struct PlacementOption {
  ActivePiece placement;
  std::vector<Action> actions;
  Board board;
  int linesCleared;
  bool perfectClear;
  double reward;
};

struct RootPlacement {
  PlacementOption placement;
  std::optional<PieceType> holdPiece;
  std::size_t nextIndex;
};

struct BeamState {
  Board board;
  double accumulatedReward;
  double rank;
  std::size_t firstPlacement;
  std::optional<PieceType> holdPiece;
  std::size_t nextIndex;
};

using StateKey = std::tuple<int, int, int>;
using PlacementKey = std::tuple<int, int, int>;

bool deadlineReached(const Deadline& deadline) noexcept {
  return Clock::now() >= deadline;
}

std::optional<ActivePiece> applyAction(const Board& board,
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

double placementReward(int lines, bool perfectClear) noexcept {
  // Hard deliberately treats every placement as an ordinary line clear.
  // T-Spin detection, spin attack tables, B2B, and setup preservation belong
  // exclusively to Expert.
  static constexpr std::array<int, 5> kLineGarbage{0, 0, 1, 2, 4};
  const int garbage =
      kLineGarbage[static_cast<std::size_t>(std::min(lines, 4))];
  static constexpr std::array<double, 5> kLineReward{
      0.0, 40.0, 100.0, 180.0, 400.0};
  double reward = 900.0 * garbage +
                  kLineReward[static_cast<std::size_t>(lines)];
  if (perfectClear) reward += 7000.0;
  return reward;
}

}  // namespace

HardBoardEvaluation evaluateHardBoard(const Board& board) noexcept {
  std::array<int, kBoardCols> heights{};
  int aggregateHeight = 0;
  int holes = 0;
  int coveredHoleDepth = 0;
  int maximumHeight = 0;
  int rowTransitions = 0;
  int columnTransitions = 0;

  for (int col = 0; col < kBoardCols; ++col) {
    int top = kBoardRows;
    int blocksAbove = 0;
    for (int row = 0; row < kBoardRows; ++row) {
      if (board.cells()[row][col] != Cell::Empty) {
        if (top == kBoardRows) top = row;
        ++blocksAbove;
      } else if (top != kBoardRows) {
        ++holes;
        coveredHoleDepth += blocksAbove;
      }
    }
    heights[col] = kBoardRows - top;
    aggregateHeight += heights[col];
    maximumHeight = std::max(maximumHeight, heights[col]);
  }
  for (int row = 0; row < kBoardRows; ++row) {
    bool previousOccupied = true;
    for (int col = 0; col < kBoardCols; ++col) {
      const bool currentOccupied =
          board.cells()[row][col] != Cell::Empty;
      if (currentOccupied != previousOccupied) ++rowTransitions;
      previousOccupied = currentOccupied;
    }
    if (!previousOccupied) ++rowTransitions;
  }
  for (int col = 0; col < kBoardCols; ++col) {
    bool previousOccupied = true;
    for (int row = 0; row < kBoardRows; ++row) {
      const bool currentOccupied =
          board.cells()[row][col] != Cell::Empty;
      if (currentOccupied != previousOccupied) ++columnTransitions;
      previousOccupied = currentOccupied;
    }
    if (!previousOccupied) ++columnTransitions;
  }

  std::array<int, kBoardCols> wellStreak{};
  int tetrisWell = 0;
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
        tetrisWell = std::max(tetrisWell, wellStreak[col]);
      } else {
        wellStreak[col] = 0;
      }
    }
  }

  std::array<int, kBoardCols> surfaceWellDepths{};
  int primaryWellColumn = -1;
  int primaryWellDepth = 0;
  for (int col = 0; col < kBoardCols; ++col) {
    const int leftHeight =
        col == 0 ? heights[col + 1] : heights[col - 1];
    const int rightHeight =
        col + 1 == kBoardCols ? heights[col - 1] : heights[col + 1];
    surfaceWellDepths[col] =
        std::max(0, std::min(leftHeight, rightHeight) - heights[col]);
    if (surfaceWellDepths[col] > primaryWellDepth) {
      primaryWellDepth = surfaceWellDepths[col];
      primaryWellColumn = col;
    }
  }

  // One one-column Well is useful for an I piece. Its two boundary steps are
  // intentionally excluded from the flat surface measurement; every other
  // valley and cliff is unwanted roughness.
  const bool preservePrimaryWell = primaryWellDepth >= 2;
  int flatSurfaceRoughness = 0;
  int excessiveSurfaceSteps = 0;
  for (int col = 0; col + 1 < kBoardCols; ++col) {
    if (preservePrimaryWell &&
        (col == primaryWellColumn - 1 || col == primaryWellColumn)) {
      continue;
    }
    const int difference = std::abs(heights[col] - heights[col + 1]);
    flatSurfaceRoughness += difference;
    const int excessive = std::max(0, difference - 1);
    excessiveSurfaceSteps += excessive * excessive;
  }

  int extraWellCount = 0;
  int extraWellDepth = 0;
  for (int col = 0; col < kBoardCols; ++col) {
    if (col == primaryWellColumn || surfaceWellDepths[col] == 0) continue;
    ++extraWellCount;
    extraWellDepth += surfaceWellDepths[col] * surfaceWellDepths[col];
  }

  // Generic board quality only. A newly buried cell must cost more than any
  // ordinary clear can earn; otherwise a short beam trades permanent holes
  // for local Tetrises. Hard still chooses the least damaging move when a
  // hole is unavoidable (for example while digging incoming garbage).
  const int rewardedWellDepth =
      std::min(std::max(tetrisWell, primaryWellDepth), 4);
  const int deepWellOverflow = std::max(0, primaryWellDepth - 4);
  double value = -0.90 * aggregateHeight - 9000.0 * holes -
                 1800.0 * holes * holes - 350.0 * coveredHoleDepth -
                 4.0 * flatSurfaceRoughness -
                 80.0 * excessiveSurfaceSteps -
                 350.0 * extraWellCount - 220.0 * extraWellDepth -
                 180.0 * deepWellOverflow * deepWellOverflow -
                 1.20 * rowTransitions - 0.80 * columnTransitions -
                 4.0 * maximumHeight + 45.0 * rewardedWellDepth +
                 18.0 * rewardedWellDepth * rewardedWellDepth;
  if (maximumHeight >= 12) {
    const int danger = maximumHeight - 11;
    value -= 20.0 * danger * danger;
  }
  if (maximumHeight >= 16) value -= 200.0 * (maximumHeight - 15);
  return {value,
          aggregateHeight,
          maximumHeight,
          holes,
          coveredHoleDepth,
          primaryWellColumn,
          primaryWellDepth,
          extraWellCount,
          extraWellDepth,
          flatSurfaceRoughness,
          excessiveSurfaceSteps};
}

namespace {

std::uint64_t hashBoard(const Board& board) noexcept {
  std::uint64_t hash = 1469598103934665603ULL;
  for (const Board::Row& row : board.cells()) {
    for (const Cell cell : row) {
      hash ^= static_cast<std::uint64_t>(cell) + 1;
      hash *= 1099511628211ULL;
    }
  }
  return hash;
}

std::uint64_t hashState(const BeamState& state) noexcept {
  std::uint64_t hash = hashBoard(state.board);
  const std::uint64_t hold = state.holdPiece
                                 ? static_cast<std::uint64_t>(*state.holdPiece) + 1
                                 : 0;
  hash ^= hold + 0x9e3779b97f4a7c15ULL + (hash << 6U) + (hash >> 2U);
  hash ^= static_cast<std::uint64_t>(state.nextIndex) +
          0x9e3779b97f4a7c15ULL + (hash << 6U) + (hash >> 2U);
  return hash;
}

std::vector<PlacementOption> enumeratePlacements(
    const Board& board, PieceType type, int spawnX, int spawnY,
    int spawnRotation, const Deadline& deadline, bool& timedOut,
    std::uint64_t& nodesVisited) {
  const ActivePiece spawn{type, spawnX, spawnY,
                          ((spawnRotation % 4) + 4) % 4};
  if (!isValidPosition(board, spawn)) return {};

  static constexpr std::array<Action, 6> kActions{
      Action::MoveLeft,          Action::MoveRight,
      Action::RotateClockwise,  Action::RotateCounterClockwise,
      Action::Rotate180,        Action::SoftDrop,
  };

  std::queue<SearchNode> pending;
  std::set<StateKey> visited;
  std::map<PlacementKey, PlacementOption> placements;
  pending.push({spawn, {}});
  visited.insert({spawn.x, spawn.y, spawn.rotation});

  while (!pending.empty()) {
    if ((nodesVisited & 63U) == 0U && deadlineReached(deadline)) {
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
    const bool perfectClear = cleared.linesCleared > 0 && cleared.board.empty();
    const double reward = placementReward(cleared.linesCleared, perfectClear);
    std::vector<Action> placementActions = node.actions;
    placementActions.push_back(Action::HardDrop);
    PlacementOption option{placement,
                           std::move(placementActions),
                           cleared.board,
                           cleared.linesCleared,
                           perfectClear,
                           reward};
    auto existing = placements.find(placementKey);
    if (existing == placements.end() ||
        option.reward > existing->second.reward ||
        (option.reward == existing->second.reward &&
         option.actions.size() < existing->second.actions.size())) {
      placements.insert_or_assign(placementKey, std::move(option));
    }

    for (const Action action : kActions) {
      int nextKickIndex = -1;
      const auto next = applyAction(board, node.piece, action, &nextKickIndex);
      if (!next) continue;
      const StateKey stateKey{next->x, next->y, next->rotation};
      if (!visited.insert(stateKey).second) continue;
      std::vector<Action> actions = node.actions;
      actions.push_back(action);
      pending.push({*next, std::move(actions)});
    }
  }

  const int holesBeforePlacement = evaluateHardBoard(board).holes;
  std::vector<PlacementOption> result;
  result.reserve(placements.size());
  for (auto& entry : placements) {
    PlacementOption option = std::move(entry.second);
    const int holesAfterPlacement = evaluateHardBoard(option.board).holes;
    const int createdHoles =
        std::max(0, holesAfterPlacement - holesBeforePlacement);
    // Charging this at every ply prevents the beam from roofing a cell for
    // one move and hiding the damage again before the leaf evaluation.
    option.reward -= kCreatedHolePenalty * createdHoles;
    result.push_back(std::move(option));
  }
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

}  // namespace

HardAgent::HardAgent(std::chrono::milliseconds thinkTime)
    : thinkTime_(std::max(thinkTime, std::chrono::milliseconds(1))) {}

std::string_view HardAgent::name() const noexcept { return "hard"; }

std::optional<AgentDecision> HardAgent::decide(
    const DecisionContext& context) {
  const Board& board = context.board;
  const PieceType type = context.active;
  const std::vector<PieceType>& nextPieces = context.next;
  const std::optional<PieceType> holdPiece = context.hold;
  const bool canHold = context.canHold;
  const int spawnX = context.spawnX;
  const int spawnY = context.spawnY;
  const int spawnRotation = context.spawnRotation;
  const std::vector<int> garbageGaps = projectedGarbageGaps(context);
  const auto fallback = decideEasy(board, type, spawnX, spawnY,
                                   spawnRotation, garbageGaps);
  if (!fallback) return std::nullopt;

  const Deadline deadline = Clock::now() + thinkTime_;
  bool timedOut = false;
  std::uint64_t nodesVisited = 0;
  auto currentPlacements = enumeratePlacements(
      board, type, spawnX, spawnY, spawnRotation, deadline, timedOut,
      nodesVisited);
  if (timedOut || currentPlacements.empty()) {
    AgentDecision decision = *fallback;
    decision.nodesVisited = nodesVisited;
    decision.timedOut = timedOut;
    return decision;
  }

  std::vector<RootPlacement> rootPlacements;
  rootPlacements.reserve(currentPlacements.size() * 2);
  for (PlacementOption& placement : currentPlacements) {
    placement.board = applyPendingGarbage(placement.board, garbageGaps);
    rootPlacements.push_back(
        {std::move(placement), holdPiece, 0});
  }

  if (canHold && (holdPiece || !nextPieces.empty())) {
    const PieceType heldActive = holdPiece ? *holdPiece : nextPieces.front();
    const std::size_t nextIndexAfterHold = holdPiece ? 0 : 1;
    // TS resets a held piece to the same spawn height supplied in the request.
    // Starting at y=0 here made long soft-drop routes diverge from the
    // authoritative TS replay, whose internal spawn row is y=18.
    auto heldPlacements = enumeratePlacements(
        board, heldActive, 3, spawnY, 0, deadline, timedOut, nodesVisited);
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

  std::vector<BeamState> layer;
  layer.reserve(rootPlacements.size());
  for (std::size_t index = 0; index < rootPlacements.size(); ++index) {
    const auto& root = rootPlacements[index];
    const HardBoardEvaluation boardEvaluation =
        evaluateHardBoard(root.placement.board);
    const double reward = root.placement.reward;
    layer.push_back(
        {root.placement.board,
         reward,
         reward + kFutureDiscount * boardEvaluation.value,
         index,
         root.holdPiece,
         root.nextIndex});
  }
  std::sort(layer.begin(), layer.end(),
            [](const BeamState& left, const BeamState& right) {
              return left.rank > right.rank;
            });
  if (layer.size() > kBeamWidth) layer.resize(kBeamWidth);

  std::size_t bestFirstPlacement = layer[bestStateIndex(layer)].firstPlacement;
  int completedDepth = 1;
  double discount = kFutureDiscount;

  for (std::size_t depth = 1;
       depth <= nextPieces.size() && completedDepth < kMaximumSearchDepth;
       ++depth) {
    if (deadlineReached(deadline)) {
      timedOut = true;
      break;
    }
    const bool everyStateHasNext =
        std::all_of(layer.begin(), layer.end(), [&](const BeamState& state) {
          return state.nextIndex < nextPieces.size();
        });
    if (!everyStateHasNext) break;
    std::vector<BeamState> candidates;
    candidates.reserve(layer.size() * 16);
    bool incompleteDepth = false;

    for (const BeamState& state : layer) {
      if (state.nextIndex >= nextPieces.size()) continue;
      const PieceType activeType = nextPieces[state.nextIndex];

      auto addPlacements = [&](PieceType pieceToPlace,
                               std::optional<PieceType> holdAfter,
                               std::size_t nextIndexAfter) {
        auto placements = enumeratePlacements(
            state.board, pieceToPlace, 3, kSpawnY, 0, deadline, timedOut,
            nodesVisited);
        if (timedOut) return;
        for (const PlacementOption& placement : placements) {
          const HardBoardEvaluation boardEvaluation =
              evaluateHardBoard(placement.board);
          const double reward = state.accumulatedReward +
                                discount * placement.reward;
          candidates.push_back(
              {placement.board,
               reward,
               reward + discount * kFutureDiscount * boardEvaluation.value,
               state.firstPlacement,
               holdAfter,
               nextIndexAfter});
        }
      };

      addPlacements(activeType, state.holdPiece, state.nextIndex + 1);
      if (timedOut) {
        incompleteDepth = true;
        break;
      }

      if (state.holdPiece) {
        addPlacements(*state.holdPiece, activeType, state.nextIndex + 1);
      } else if (state.nextIndex + 1 < nextPieces.size()) {
        addPlacements(nextPieces[state.nextIndex + 1], activeType,
                      state.nextIndex + 2);
      }
      if (timedOut) {
        incompleteDepth = true;
        break;
      }
    }
    if (incompleteDepth || candidates.empty()) break;

    std::sort(candidates.begin(), candidates.end(),
              [](const BeamState& left, const BeamState& right) {
                return left.rank > right.rank;
              });
    std::unordered_set<std::uint64_t> seenBoards;
    std::vector<BeamState> nextLayer;
    nextLayer.reserve(std::min(kBeamWidth, candidates.size()));
    for (BeamState& candidate : candidates) {
      if (!seenBoards.insert(hashState(candidate)).second) continue;
      nextLayer.push_back(std::move(candidate));
      if (nextLayer.size() == kBeamWidth) break;
    }
    if (nextLayer.empty()) break;

    layer = std::move(nextLayer);
    bestFirstPlacement = layer[bestStateIndex(layer)].firstPlacement;
    ++completedDepth;
    discount *= kFutureDiscount;
  }

  const PlacementOption& best = rootPlacements[bestFirstPlacement].placement;
  return AgentDecision{best.placement,
                       best.actions,
                       -layer[bestStateIndex(layer)].rank,
                       best.linesCleared,
                       completedDepth,
                       nodesVisited,
                       timedOut};
}

}  // namespace tetris
