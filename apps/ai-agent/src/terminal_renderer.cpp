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
                              PieceType placedPiece, int clearedThisMove,
                              std::optional<PieceType> holdPiece) {
  if (gameNumber != lastGameNumber_ || result.piecesPlaced == 1) {
    lastGameNumber_ = gameNumber;
    lastTetrises_ = 0;
    lastTSpins_ = 0;
    lastTSpinSingles_ = 0;
    lastTSpinDoubles_ = 0;
    lastTSpinTriples_ = 0;
    lastPerfectClears_ = 0;
  }
  std::string_view clearEvent;
  if (result.perfectClears > lastPerfectClears_) {
    clearEvent = "PERFECT CLEAR!";
  } else if (result.tSpinTriples > lastTSpinTriples_) {
    clearEvent = "T-SPIN TRIPLE!";
  } else if (result.tSpinDoubles > lastTSpinDoubles_) {
    clearEvent = "T-SPIN DOUBLE!";
  } else if (result.tSpinSingles > lastTSpinSingles_) {
    clearEvent = "T-SPIN SINGLE!";
  } else if (result.tSpins > lastTSpins_) {
    clearEvent = "T-SPIN MINI!";
  } else if (result.tetrises > lastTetrises_) {
    clearEvent = "TETRIS!";
  } else if (clearedThisMove == 3) {
    clearEvent = "TRIPLE";
  } else if (clearedThisMove == 2) {
    clearEvent = "DOUBLE";
  } else if (clearedThisMove == 1) {
    clearEvent = "SINGLE";
  }
  lastTetrises_ = result.tetrises;
  lastTSpins_ = result.tSpins;
  lastTSpinSingles_ = result.tSpinSingles;
  lastTSpinDoubles_ = result.tSpinDoubles;
  lastTSpinTriples_ = result.tSpinTriples;
  lastPerfectClears_ = result.perfectClears;

  cursorHidden_ = true;
  std::cout << "\x1b[?25l\x1b[2J\x1b[H"
            << "AI benchmark preview\n"
            << "model=" << model << "  game=" << gameNumber
            << "  seed=" << result.seed << '\n'
            << "piece=" << toString(placedPiece)
            << "  hold="
            << (holdPiece ? toString(*holdPiece) : std::string_view("-"))
            << "  holds=" << result.holdsUsed
            << "  placed=" << result.piecesPlaced
            << "  lines=" << result.linesCleared
            << "  score=" << result.score
            << "  attack=" << result.attacksSent
            << "  b2b=" << result.currentBackToBack << " (max="
            << result.maxBackToBack << ", breaks="
            << result.backToBackBreaks << ')'
            << "  tspin=" << result.tSpins << " (M/S/D/T="
            << result.tSpinMinis << '/' << result.tSpinSingles << '/'
            << result.tSpinDoubles << '/' << result.tSpinTriples << ')';
  if (clearedThisMove > 0) {
    std::cout << "  cleared=+" << clearedThisMove;
  }
  if (!clearEvent.empty()) {
    std::cout << "  \x1b[1;93m" << clearEvent << "\x1b[0m";
  }
  std::cout << "\n\n+--------------------+\n";

  for (int rowIndex = kBoardRows - kVisibleBoardRows;
       rowIndex < kBoardRows; ++rowIndex) {
    const Board::Row& row = board.cells()[rowIndex];
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
