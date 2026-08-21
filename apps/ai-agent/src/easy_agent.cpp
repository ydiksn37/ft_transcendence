#include "tetris/easy_agent.hpp"

#include <cmath>
#include <queue>
#include <set>
#include <tuple>
#include <utility>

namespace tetris {
namespace {

struct SearchNode {
  ActivePiece piece;
  std::vector<Action> actions;
};

using StateKey = std::tuple<int, int, int>;

StateKey keyFor(const ActivePiece& piece) {
  return {piece.x, piece.y, piece.rotation};
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

}  // namespace

std::string_view toString(Action action) noexcept {
  switch (action) {
    case Action::MoveLeft:
      return "move_left";
    case Action::MoveRight:
      return "move_right";
    case Action::RotateClockwise:
      return "rotate_cw";
    case Action::RotateCounterClockwise:
      return "rotate_ccw";
    case Action::Rotate180:
      return "rotate_180";
    case Action::SoftDrop:
      return "soft_drop";
    case Action::HardDrop:
      return "hard_drop";
    case Action::Hold:
      return "hold";
  }
  return "unknown";
}

BoardEvaluation evaluateBoard(const Board& board) noexcept {
  int aggregateHeight = 0;
  int holes = 0;
  int bumpiness = 0;
  std::array<int, kBoardCols> heights{};

  for (int col = 0; col < kBoardCols; ++col) {
    int topRow = kBoardRows;
    bool foundTop = false;
    for (int row = 0; row < kBoardRows; ++row) {
      if (board.cells()[row][col] != Cell::Empty && !foundTop) {
        topRow = row;
        foundTop = true;
      }
      if (foundTop && board.cells()[row][col] == Cell::Empty) ++holes;
    }
    heights[col] = kBoardRows - topRow;
    aggregateHeight += heights[col];
  }

  for (int col = 0; col < kBoardCols - 1; ++col) {
    bumpiness += std::abs(heights[col] - heights[col + 1]);
  }

  const double score = aggregateHeight * 0.51 + holes * 0.36 + bumpiness * 0.18;
  return {aggregateHeight, holes, bumpiness, score};
}

std::optional<EasyDecision> decideEasy(const Board& board,
                                       PieceType type,
                                       int spawnX,
                                       int spawnY,
                                       int spawnRotation) {
  const ActivePiece spawn{type, spawnX, spawnY,
                          ((spawnRotation % 4) + 4) % 4};
  if (!isValidPosition(board, spawn)) return std::nullopt;

  static constexpr std::array<Action, 6> kSearchActions{
      Action::MoveLeft,
      Action::MoveRight,
      Action::RotateClockwise,
      Action::RotateCounterClockwise,
      Action::Rotate180,
      Action::SoftDrop,
  };

  std::queue<SearchNode> pending;
  std::set<StateKey> visited;
  std::set<StateKey> evaluatedPlacements;
  pending.push({spawn, {}});
  visited.insert(keyFor(spawn));

  std::optional<EasyDecision> best;
  constexpr double kEpsilon = 1e-9;

  while (!pending.empty()) {
    SearchNode node = std::move(pending.front());
    pending.pop();

    ActivePiece placement = node.piece;
    placement.y = calcGhostY(board, placement);
    if (evaluatedPlacements.insert(keyFor(placement)).second) {
      const Board locked = lockMino(board, placement);
      const ClearResult cleared = clearLines(locked);
      const BoardEvaluation evaluation = evaluateBoard(cleared.board);
      std::vector<Action> actions = node.actions;
      actions.push_back(Action::HardDrop);

      const bool betterScore = !best || evaluation.score < best->score - kEpsilon;
      const bool shorterTie =
          best && std::abs(evaluation.score - best->score) <= kEpsilon &&
          actions.size() < best->actions.size();
      if (betterScore || shorterTie) {
        best = EasyDecision{placement, std::move(actions), evaluation.score,
                            cleared.linesCleared};
      }
    }

    for (const Action action : kSearchActions) {
      const auto next = applySearchAction(board, node.piece, action);
      if (!next || !visited.insert(keyFor(*next)).second) continue;
      std::vector<Action> actions = node.actions;
      actions.push_back(action);
      pending.push({*next, std::move(actions)});
    }
  }
  return best;
}

}  // namespace tetris
