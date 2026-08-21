#pragma once

#include <cstddef>
#include <cstdint>
#include <string_view>

#include "tetris/game_simulator.hpp"

namespace tetris {

class TerminalRenderer {
 public:
  explicit TerminalRenderer(std::uint64_t delayMs);
  ~TerminalRenderer();

  TerminalRenderer(const TerminalRenderer&) = delete;
  TerminalRenderer& operator=(const TerminalRenderer&) = delete;

  void render(std::size_t gameNumber, std::string_view model,
              const Board& board, const GameResult& result,
              PieceType placedPiece, int clearedThisMove,
              std::optional<PieceType> holdPiece);
  void finish();

 private:
  std::uint64_t delayMs_;
  bool cursorHidden_ = false;
  std::size_t lastGameNumber_ = 0;
  int lastTetrises_ = 0;
  int lastTSpins_ = 0;
  int lastTSpinSingles_ = 0;
  int lastTSpinDoubles_ = 0;
  int lastTSpinTriples_ = 0;
  int lastPerfectClears_ = 0;
};

}  // namespace tetris
