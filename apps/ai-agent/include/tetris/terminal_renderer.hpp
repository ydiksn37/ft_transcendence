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
              PieceType placedPiece, int clearedThisMove);
  void finish();

 private:
  std::uint64_t delayMs_;
  bool cursorHidden_ = false;
};

}  // namespace tetris
