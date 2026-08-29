#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <optional>

#include "tetris/agent.hpp"

namespace tetris {

struct GameResult {
  std::uint32_t seed = 0;
  std::size_t piecesPlaced = 0;
  int linesCleared = 0;
  std::int64_t score = 0;
  std::int64_t attacksSent = 0;
  int singles = 0;
  int doubles = 0;
  int triples = 0;
  int tetrises = 0;
  int tSpins = 0;
  int tSpinMinis = 0;
  int tSpinSingles = 0;
  int tSpinDoubles = 0;
  int tSpinTriples = 0;
  int perfectClears = 0;
  std::size_t holdsUsed = 0;
  std::size_t backToBackClears = 0;
  std::size_t backToBackContinuations = 0;
  std::size_t backToBackBreaks = 0;
  int currentBackToBack = 0;
  int maxBackToBack = 0;
  bool gameOver = false;
  bool reachedPieceLimit = false;
  bool invalidDecision = false;
  double elapsedMs = 0.0;
  double totalDecisionMs = 0.0;
  double maxDecisionMs = 0.0;
  std::uint64_t searchNodes = 0;
  std::uint64_t totalSearchDepth = 0;
  int maxSearchDepth = 0;
  std::size_t timedOutDecisions = 0;

  [[nodiscard]] double averageDecisionMs() const noexcept;
  [[nodiscard]] double averageSearchDepth() const noexcept;
};

// Mirrors apps/backend/src/game/engine/garbage.ts. The B2B flag is the state
// before the current clear, just like calcGarbage receives in TypeScript.
[[nodiscard]] int calculateGarbage(int linesCleared,
                                   std::optional<TSpin> tSpin,
                                   bool perfectClear,
                                   bool backToBackActive,
                                   int combo = -1) noexcept;

using FrameCallback = std::function<void(const Board&, const GameResult&,
                                         PieceType, int,
                                         std::optional<PieceType>)>;

[[nodiscard]] GameResult simulateGame(Agent& agent, std::uint32_t seed,
                                      std::size_t maxPieces,
                                      const FrameCallback& onFrame = {});

}  // namespace tetris
