#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>

#include "tetris/agent.hpp"

namespace tetris {

struct GameResult {
  std::uint32_t seed = 0;
  std::size_t piecesPlaced = 0;
  int linesCleared = 0;
  std::int64_t score = 0;
  int singles = 0;
  int doubles = 0;
  int triples = 0;
  int tetrises = 0;
  int tSpins = 0;
  int perfectClears = 0;
  bool gameOver = false;
  bool reachedPieceLimit = false;
  bool invalidDecision = false;
  double elapsedMs = 0.0;
  double totalDecisionMs = 0.0;
  double maxDecisionMs = 0.0;

  [[nodiscard]] double averageDecisionMs() const noexcept;
};

using FrameCallback = std::function<void(const Board&, const GameResult&,
                                         PieceType, int)>;

[[nodiscard]] GameResult simulateGame(Agent& agent, std::uint32_t seed,
                                      std::size_t maxPieces,
                                      const FrameCallback& onFrame = {});

}  // namespace tetris
