#include "tetris/terminal_renderer.hpp"

#include <chrono>
#include <iostream>
#include <thread>

namespace tetris {
namespace {

std::string_view cellColor(Cell cell) noexcept {
  switch (cell) {
    case Cell::I:
      return "\x1b[46m";          // cyan
    case Cell::O:
      return "\x1b[43m";          // yellow
    case Cell::T:
      return "\x1b[45m";          // magenta
    case Cell::S:
      return "\x1b[42m";          // green
    case Cell::Z:
      return "\x1b[41m";          // red
    case Cell::J:
      return "\x1b[44m";          // blue
    case Cell::L:
      return "\x1b[48;5;208m";    // orange
    case Cell::Garbage:
      return "\x1b[100m";         // gray
    case Cell::Empty:
      return "\x1b[48;5;234m";    // near black
  }
  return "\x1b[0m";
}

}  // namespace

TerminalRenderer::TerminalRenderer(std::uint64_t delayMs) : delayMs_(delayMs) {}

TerminalRenderer::~TerminalRenderer() { finish(); }

void TerminalRenderer::render(std::size_t gameNumber, std::string_view model,
                              const Board& board, const GameResult& result,
                              PieceType placedPiece, int clearedThisMove) {
  cursorHidden_ = true;
  std::cout << "\x1b[?25l\x1b[2J\x1b[H"
            << "AI benchmark preview\n"
            << "model=" << model << "  game=" << gameNumber
            << "  seed=" << result.seed << '\n'
            << "piece=" << toString(placedPiece)
            << "  placed=" << result.piecesPlaced
            << "  lines=" << result.linesCleared
            << "  score=" << result.score;
  if (clearedThisMove > 0) {
    std::cout << "  cleared=+" << clearedThisMove;
  }
  std::cout << "\n\n+--------------------+\n";

  for (const Board::Row& row : board.cells()) {
    std::cout << "|";
    for (const Cell cell : row) {
      std::cout << cellColor(cell) << "  ";
    }
    std::cout << "\x1b[0m|\n";
  }
  std::cout << "+--------------------+\n\x1b[0m" << std::flush;

  if (delayMs_ > 0) {
    std::this_thread::sleep_for(std::chrono::milliseconds(delayMs_));
  }
}

void TerminalRenderer::finish() {
  if (!cursorHidden_) return;
  std::cout << "\x1b[0m\x1b[?25h\n" << std::flush;
  cursorHidden_ = false;
}

}  // namespace tetris
