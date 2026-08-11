#pragma once

#include <optional>
#include <string_view>
#include <vector>

#include "tetris/board.hpp"

namespace tetris {

enum class Action {
  MoveLeft,
  MoveRight,
  RotateClockwise,
  RotateCounterClockwise,
  Rotate180,
  SoftDrop,
  HardDrop,
};

struct BoardEvaluation {
  int aggregateHeight;
  int holes;
  int bumpiness;
  double score;
};

struct EasyDecision {
  ActivePiece placement;
  std::vector<Action> actions;
  double score;
  int linesCleared;
};

[[nodiscard]] std::string_view toString(Action action) noexcept;
[[nodiscard]] BoardEvaluation evaluateBoard(const Board& board) noexcept;

// Searches every placement reachable with normal moves for the current piece
// only. Lower evaluation scores are better, matching the existing TypeScript AI.
[[nodiscard]] std::optional<EasyDecision> decideEasy(
    const Board& board, PieceType type, int spawnX = 3, int spawnY = 0,
    int spawnRotation = 0);

}  // namespace tetris
