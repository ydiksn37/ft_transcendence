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

struct SearchLimit {
  Deadline deadline;
  std::uint64_t maximumNodes;
};

struct BoardFeatures {
  double value = 0.0;
  int maximumHeight = 0;
};

struct SearchNode {
  ActivePiece piece;
  std::vector<Action> actions;
  bool lastMoveWasRotation = false;
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
};

using SearchKey = std::tuple<int, int, int, bool>;
using PlacementKey = std::tuple<int, int, int>;

bool searchLimitReached(const SearchLimit& limit,
                        std::uint64_t nodesVisited) noexcept {
  if (limit.maximumNodes > 0) return nodesVisited >= limit.maximumNodes;
  return Clock::now() >= limit.deadline;
}

std::optional<ActivePiece> applySearchAction(const Board& board,
                                             const ActivePiece& piece,
                                             Action action) {
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
      return tryRotate(board, piece, RotationDirection::Clockwise);
    case Action::RotateCounterClockwise:
      return tryRotate(board, piece, RotationDirection::CounterClockwise);
    case Action::Rotate180:
      return tryRotate(board, piece, RotationDirection::Rotate180);
    case Action::HardDrop:
    case Action::Hold:
      return std::nullopt;
  }
  if (isValidPosition(board, moved)) return moved;
  return std::nullopt;
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
      if (occupiedRows[y] == (kFullRow ^ center) &&
          occupiedRows[y + 1] == (kFullRow ^ threeWide) &&
          (occupiedRows[y + 2] & sideCorners) != 0U) {
        ++slots;
      }
      if ((occupiedRows[y] & sideCorners) != 0U &&
          occupiedRows[y + 1] == (kFullRow ^ threeWide) &&
          occupiedRows[y + 2] == (kFullRow ^ center)) {
        ++slots;
      }
    }
  }
  return slots;
}

BoardFeatures evaluateBoardForExpert(const Board& board,
                                     const ExpertWeights& weights) noexcept {
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

  const int readyTSpinDoubles = countReadyTSpinDoubleSlots(board);
  double value = -weights.aggregateHeightPenalty * aggregateHeight -
                 weights.holesPenalty * holes -
                 weights.coveredHolePenalty * coveredHoleDepth -
                 weights.bumpinessPenalty * bumpiness -
                 weights.rowTransitionsPenalty * rowTransitions -
                 weights.columnTransitionsPenalty * columnTransitions -
                 weights.maximumHeightPenalty * maximumHeight +
                 weights.wellReward * deepestWell * deepestWell +
                 weights.edgeWellReward * deepestEdgeWell * deepestEdgeWell +
                 weights.readyTSpinDoubleReward * readyTSpinDoubles;

  if (maximumHeight >= 11) {
    const int danger = maximumHeight - 10;
    value -= weights.dangerQuadraticPenalty * danger * danger;
  }
  if (maximumHeight >= 15) {
    value -= weights.dangerLinearPenalty * (maximumHeight - 14);
  }
  if (maximumHeight >= 18) value -= weights.topOutPenalty;
  return {value, maximumHeight};
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
                       const ExpertWeights& weights) noexcept {
  if (placement.linesCleared == 0) return 0.0;

  const int garbage = garbageFor(placement, backToBackActive);
  double reward = weights.garbageReward * garbage +
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
  pending.push({spawn, {}, false});
  visited.insert({spawn.x, spawn.y, spawn.rotation, false});

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
    const std::optional<TSpin> tSpin =
        detectTSpin(board, placement, node.lastMoveWasRotation);
    const ClearResult cleared = clearLines(lockMino(board, placement));
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
      const std::optional<ActivePiece> next =
          applySearchAction(board, node.piece, action);
      if (!next) continue;
      bool lastMoveWasRotation = node.lastMoveWasRotation;
      if (action == Action::RotateClockwise ||
          action == Action::RotateCounterClockwise ||
          action == Action::Rotate180) {
        lastMoveWasRotation = true;
      } else if (action == Action::MoveLeft ||
                 action == Action::MoveRight) {
        lastMoveWasRotation = false;
      }
      const SearchKey key{next->x, next->y, next->rotation,
                          lastMoveWasRotation};
      if (!visited.insert(key).second) continue;
      std::vector<Action> nextActions = node.actions;
      nextActions.push_back(action);
      pending.push({*next, std::move(nextActions), lastMoveWasRotation});
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

ExpertAgent::ExpertAgent(std::chrono::milliseconds thinkTime,
                         ExpertWeights weights,
                         std::uint64_t maximumNodes)
    : thinkTime_(std::max(thinkTime, std::chrono::milliseconds(1))),
      weights_(std::move(weights)),
      maximumNodes_(maximumNodes) {}

std::string_view ExpertAgent::name() const noexcept { return "expert"; }

std::optional<AgentDecision> ExpertAgent::decide(
    const Board& board, PieceType type,
    const std::vector<PieceType>& nextPieces,
    std::optional<PieceType> holdPiece, bool canHold, int spawnX,
    int spawnY, int spawnRotation, bool backToBackActive) {
  const std::optional<AgentDecision> fallback =
      decideEasy(board, type, spawnX, spawnY, spawnRotation);
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
    rootPlacements.push_back({std::move(placement), holdPiece, 0});
  }

  if (canHold && (holdPiece || !nextPieces.empty())) {
    const PieceType heldActive = holdPiece ? *holdPiece : nextPieces.front();
    const std::size_t nextIndexAfterHold = holdPiece ? 0U : 1U;
    std::vector<PlacementOption> heldPlacements = enumeratePlacements(
        board, heldActive, 3, 0, 0, limit, timedOut, nodesVisited);
    if (timedOut) {
      AgentDecision decision = *fallback;
      decision.nodesVisited = nodesVisited;
      decision.timedOut = true;
      return decision;
    }
    for (PlacementOption& placement : heldPlacements) {
      placement.actions.insert(placement.actions.begin(), Action::Hold);
      rootPlacements.push_back(
          {std::move(placement), type, nextIndexAfterHold});
    }
  }

  const BoardFeatures initialFeatures = evaluateBoardForExpert(board, weights_);
  std::vector<BeamState> layer;
  layer.reserve(rootPlacements.size());
  for (std::size_t index = 0; index < rootPlacements.size(); ++index) {
    const RootPlacement& root = rootPlacements[index];
    const BoardFeatures features =
        evaluateBoardForExpert(root.placement.board, weights_);
    const double reward = placementReward(
        root.placement, backToBackActive, initialFeatures.maximumHeight,
        weights_);
    layer.push_back({root.placement.board,
                     reward,
                     reward + kFutureDiscount * features.value,
                     index,
                     root.holdPiece,
                     root.nextIndex,
                     backToBackAfter(root.placement, backToBackActive),
                     features.maximumHeight});
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
          const BoardFeatures features =
              evaluateBoardForExpert(placement.board, weights_);
          const double moveReward = placementReward(
              placement, state.backToBackActive, state.maximumHeight,
              weights_);
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
               features.maximumHeight});
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
