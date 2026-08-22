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

constexpr std::size_t kBeamWidth = 16;
constexpr double kFutureDiscount = 0.92;
constexpr double kBackToBackContinuationReward = 600.0;
constexpr double kBackToBackBreakPenalty = 1800.0;

struct HardBoardEvaluation {
  double value;
  int maximumHeight;
};

struct SearchNode {
  ActivePiece piece;
  std::vector<Action> actions;
  int lastRotationKickIndex;
};

struct PlacementOption {
  ActivePiece placement;
  std::vector<Action> actions;
  Board board;
  int linesCleared;
  std::optional<TSpin> tSpin;
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
  bool backToBackActive;
  int maximumHeight;
};

using StateKey = std::tuple<int, int, int, int>;
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

double placementReward(int lines, std::optional<TSpin> tSpin,
                       bool perfectClear) noexcept {
  static constexpr std::array<double, 5> kLineReward{
      0.0, 40.0, 180.0, 450.0, 1800.0};
  double reward = kLineReward[static_cast<std::size_t>(lines)];
  if (tSpin == TSpin::Full) {
    // A TSD sends twice as much garbage as a TSS in the backend. Give the
    // harder setup enough margin to beat two discounted TSS clears as well.
    static constexpr std::array<double, 4> kTSpinReward{
        0.0, 700.0, 3200.0, 5200.0};
    reward += kTSpinReward[static_cast<std::size_t>(std::min(lines, 3))];
  } else if (tSpin == TSpin::Mini && lines > 0) {
    reward += 200.0 * lines;
  }
  if (perfectClear) reward += 7000.0;
  return reward;
}

bool isBackToBackClear(const PlacementOption& placement) noexcept {
  return placement.linesCleared > 0 &&
         (placement.linesCleared == 4 || placement.tSpin.has_value());
}

bool backToBackAfter(const PlacementOption& placement,
                     bool backToBackActive) noexcept {
  if (placement.linesCleared == 0) return backToBackActive;
  return isBackToBackClear(placement);
}

double rewardWithBackToBack(const PlacementOption& placement,
                            bool backToBackActive,
                            int currentMaximumHeight) noexcept {
  double reward = placement.reward;
  if (placement.linesCleared == 0) return reward;
  if (isBackToBackClear(placement)) {
    if (backToBackActive) reward += kBackToBackContinuationReward;
  } else if (backToBackActive) {
    // Prefer preserving B2B on a safe board, but allow an ordinary rescue
    // clear as the stack approaches the game-over area.
    const double safeBoardFactor = std::clamp(
        static_cast<double>(15 - currentMaximumHeight) / 5.0, 0.0, 1.0);
    const double safetyFactor = 0.25 + 0.75 * safeBoardFactor;
    reward -= kBackToBackBreakPenalty * safetyFactor;
  }
  return reward;
}

int countReadyTSpinDoubleSlots(const Board& board) noexcept {
  constexpr unsigned int kFullRow = (1U << kBoardCols) - 1U;
  std::array<unsigned int, kBoardRows> occupiedRows{};
  for (int row = 0; row < kBoardRows; ++row) {
    for (int col = 0; col < kBoardCols; ++col) {
      if (board.cells()[row][col] != Cell::Empty) {
        occupiedRows[row] |= 1U << col;
      }
    }
  }

  int slots = 0;
  for (int x = 0; x + 2 < kBoardCols; ++x) {
    const unsigned int center = 1U << (x + 1);
    const unsigned int threeWide = 7U << x;
    const unsigned int sideCorners = (1U << x) | (1U << (x + 2));
    for (int y = 0; y + 2 < kBoardRows; ++y) {
      // Up-facing T: one-cell gap above a three-cell gap, with at least one
      // supporting bottom corner. These exact row masks are the two rows that
      // a T-Spin Double would clear.
      if (occupiedRows[y] == (kFullRow ^ center) &&
          occupiedRows[y + 1] == (kFullRow ^ threeWide) &&
          (occupiedRows[y + 2] & sideCorners) != 0U) {
        ++slots;
      }

      // Down-facing T: the same completed slot mirrored vertically.
      if ((occupiedRows[y] & sideCorners) != 0U &&
          occupiedRows[y + 1] == (kFullRow ^ threeWide) &&
          occupiedRows[y + 2] == (kFullRow ^ center)) {
        ++slots;
      }
    }
  }
  return slots;
}

HardBoardEvaluation evaluateBoardForHard(const Board& board) noexcept {
  std::array<int, kBoardCols> heights{};
  int aggregateHeight = 0;
  int holes = 0;
  int coveredHoleDepth = 0;
  int bumpiness = 0;
  int maximumHeight = 0;

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
  for (int col = 0; col + 1 < kBoardCols; ++col) {
    bumpiness += std::abs(heights[col] - heights[col + 1]);
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

  // Keep completed TSD setups in the beam while waiting for T.
  double value = -0.75 * aggregateHeight - 45.0 * holes -
                 8.0 * coveredHoleDepth - 0.5 * bumpiness -
                 2.5 * maximumHeight + 35.0 * tetrisWell +
                 18.0 * tetrisWell * tetrisWell +
                 900.0 * countReadyTSpinDoubleSlots(board);
  if (maximumHeight >= 12) {
    const int danger = maximumHeight - 11;
    value -= 20.0 * danger * danger;
  }
  if (maximumHeight >= 16) value -= 200.0 * (maximumHeight - 15);
  return {value, maximumHeight};
}

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
  pending.push({spawn, {}, -1});
  visited.insert({spawn.x, spawn.y, spawn.rotation, -1});

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
    // frontend の hard drop は1段以上落ちた場合、最後の操作を drop にする。
    const int lockKickIndex =
        placement.y == node.piece.y ? node.lastRotationKickIndex : -1;
    const auto tSpin =
        detectTSpin(board, placement, lockKickIndex >= 0, lockKickIndex,
                    cleared.linesCleared);
    const bool perfectClear = cleared.linesCleared > 0 && cleared.board.empty();
    const double reward =
        placementReward(cleared.linesCleared, tSpin, perfectClear);
    std::vector<Action> placementActions = node.actions;
    placementActions.push_back(Action::HardDrop);
    PlacementOption option{placement,
                           std::move(placementActions),
                           cleared.board,
                           cleared.linesCleared,
                           tSpin,
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
      const StateKey stateKey{next->x, next->y, next->rotation,
                              nextKickIndex};
      if (!visited.insert(stateKey).second) continue;
      std::vector<Action> actions = node.actions;
      actions.push_back(action);
      pending.push({*next, std::move(actions), nextKickIndex});
    }
  }

  std::vector<PlacementOption> result;
  result.reserve(placements.size());
  for (auto& entry : placements) result.push_back(std::move(entry.second));
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
  const bool backToBackActive = context.backToBack > 0;
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
    auto heldPlacements = enumeratePlacements(
        board, heldActive, 3, 0, 0, deadline, timedOut, nodesVisited);
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
  const HardBoardEvaluation initialBoardEvaluation =
      evaluateBoardForHard(board);
  for (std::size_t index = 0; index < rootPlacements.size(); ++index) {
    const auto& root = rootPlacements[index];
    const HardBoardEvaluation boardEvaluation =
        evaluateBoardForHard(root.placement.board);
    const int dangerHeight = garbageGaps.empty()
                                 ? initialBoardEvaluation.maximumHeight
                                 : boardEvaluation.maximumHeight;
    const double reward = rewardWithBackToBack(
        root.placement, backToBackActive,
        dangerHeight);
    layer.push_back(
        {root.placement.board,
         reward,
         reward + kFutureDiscount * boardEvaluation.value,
         index,
         root.holdPiece,
         root.nextIndex,
         backToBackAfter(root.placement, backToBackActive),
         boardEvaluation.maximumHeight});
  }
  std::sort(layer.begin(), layer.end(),
            [](const BeamState& left, const BeamState& right) {
              return left.rank > right.rank;
            });
  if (layer.size() > kBeamWidth) layer.resize(kBeamWidth);

  std::size_t bestFirstPlacement = layer[bestStateIndex(layer)].firstPlacement;
  int completedDepth = 1;
  double discount = kFutureDiscount;

  for (std::size_t depth = 1; depth <= nextPieces.size(); ++depth) {
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
            state.board, pieceToPlace, 3, 0, 0, deadline, timedOut,
            nodesVisited);
        if (timedOut) return;
        for (const PlacementOption& placement : placements) {
          const HardBoardEvaluation boardEvaluation =
              evaluateBoardForHard(placement.board);
          const double placementValue = rewardWithBackToBack(
              placement, state.backToBackActive, state.maximumHeight);
          const double reward = state.accumulatedReward +
                                discount * placementValue;
          candidates.push_back(
              {placement.board,
               reward,
               reward + discount * kFutureDiscount * boardEvaluation.value,
               state.firstPlacement,
               holdAfter,
               nextIndexAfter,
               backToBackAfter(placement, state.backToBackActive),
               boardEvaluation.maximumHeight});
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
