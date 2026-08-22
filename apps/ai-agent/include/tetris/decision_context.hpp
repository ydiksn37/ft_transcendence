#pragma once

#include <optional>
#include <vector>

#include "tetris/board.hpp"

namespace tetris {

struct OpponentState {
  Board board;
  int garbageQueue = 0;
  int backToBack = 0;
  int combo = -1;
  int attacksSent = 0;
  int piecesPlaced = 0;
  bool available = false;
};

struct DecisionContext {
  Board board;
  PieceType active = PieceType::I;
  std::vector<PieceType> next;
  std::optional<PieceType> hold;
  bool canHold = true;
  int spawnX = 3;
  int spawnY = 0;
  int spawnRotation = 0;
  int backToBack = 0;
  int combo = -1;
  int garbageQueue = 0;
  std::vector<int> garbageGapColumns;
  OpponentState opponent;
};

// TypeScript currently sends only a line count. If exact hole columns are not
// supplied, generate one deterministic projection from the authoritative
// snapshot. Every candidate in a decision is evaluated against the same
// projection, so unknown garbage never biases one placement by random chance.
[[nodiscard]] std::vector<int> projectedGarbageGaps(
    const DecisionContext& context);

// Mirrors game-instance.ts ordering: pending garbage is applied after the
// current piece locks and its lines have been cleared. The caller must invoke
// this only for the root placement, not for every future search ply.
[[nodiscard]] Board applyPendingGarbage(
    const Board& board, const std::vector<int>& gapColumns);

}  // namespace tetris
