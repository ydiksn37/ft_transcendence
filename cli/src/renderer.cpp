#include "tetris_cli/renderer.hpp"

#include <algorithm>
#include <array>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <vector>

namespace tetris_cli {
namespace {

constexpr const char* kReset = "\x1b[0m";
constexpr const char* kTitleColor = "\x1b[1;38;2;0;216;232m";
constexpr const char* kBorderColor = "\x1b[38;2;107;114;128m";
constexpr const char* kAccentColor = "\x1b[1;38;2;255;220;40m";
constexpr const char* kGhostColor = "\x1b[2;38;2;148;163;184m";

const char* colorFor(tetris::Cell cell) {
  switch (cell) {
    case tetris::Cell::I: return "\x1b[38;2;0;216;232m";
    case tetris::Cell::O: return "\x1b[38;2;255;230;40m";
    case tetris::Cell::T: return "\x1b[38;2;168;85;247m";
    case tetris::Cell::S: return "\x1b[38;2;50;212;109m";
    case tetris::Cell::Z: return "\x1b[38;2;210;20;60m";
    case tetris::Cell::J: return "\x1b[38;2;59;130;246m";
    case tetris::Cell::L: return "\x1b[38;2;255;150;0m";
    case tetris::Cell::Garbage: return "\x1b[38;2;124;135;153m";
    case tetris::Cell::Empty: return kReset;
  }
  return kReset;
}

std::string formatElapsed(std::chrono::milliseconds elapsed) {
  const auto total = elapsed.count();
  const auto minutes = total / 60000;
  const auto seconds = (total / 1000) % 60;
  const auto centiseconds = (total / 10) % 100;
  std::ostringstream output;
  output << std::setfill('0') << std::setw(2) << minutes << ':' << std::setw(2)
         << seconds << '.' << std::setw(2) << centiseconds;
  return output.str();
}

std::string keyLabel(const std::string& key) {
  if (key == "left") return "LEFT";
  if (key == "right") return "RIGHT";
  if (key == "down") return "DOWN";
  if (key == "up") return "UP";
  if (key == "space") return "SPACE";
  if (key == "enter") return "ENTER";
  if (key == "escape") return "ESC";
  return key;
}

}  // namespace

Renderer::Renderer(bool color, const KeyBindings& bindings,
                   int softDropFactor, bool enhancedKeyboard)
    : color_(color),
      bindings_(bindings),
      softDropFactor_(softDropFactor),
      enhancedKeyboard_(enhancedKeyboard) {}

std::string Renderer::boardLine(const Game& game, int row) const {
  std::array<tetris::Cell, tetris::kBoardCols> cells{};
  std::array<bool, tetris::kBoardCols> ghost{};
  for (int column = 0; column < tetris::kBoardCols; ++column) {
    cells[static_cast<std::size_t>(column)] = game.board().cells()[row][column];
  }

  if (game.status() == GameStatus::Playing || game.status() == GameStatus::Paused) {
    tetris::ActivePiece ghostPiece = game.activePiece();
    ghostPiece.y = game.ghostY();
    for (const auto point : tetris::getMinoCells(ghostPiece)) {
      if (point.row == row && point.col >= 0 && point.col < tetris::kBoardCols &&
          cells[static_cast<std::size_t>(point.col)] == tetris::Cell::Empty) {
        ghost[static_cast<std::size_t>(point.col)] = true;
      }
    }
    for (const auto point : tetris::getMinoCells(game.activePiece())) {
      if (point.row == row && point.col >= 0 && point.col < tetris::kBoardCols) {
        cells[static_cast<std::size_t>(point.col)] =
            tetris::cellForPiece(game.activePiece().type);
        ghost[static_cast<std::size_t>(point.col)] = false;
      }
    }
  }

  std::ostringstream output;
  output << (color_ ? std::string(kBorderColor) + "│" + kReset : "|");
  for (int column = 0; column < tetris::kBoardCols; ++column) {
    const auto index = static_cast<std::size_t>(column);
    if (ghost[index]) {
      output << (color_ ? std::string(kGhostColor) + "░░" + kReset : "..");
    } else if (cells[index] == tetris::Cell::Empty) {
      output << "  ";
    } else if (color_) {
      output << colorFor(cells[index]) << "██\x1b[0m";
    } else {
      output << "[]";
    }
  }
  output << (color_ ? std::string(kBorderColor) + "│" + kReset : "|");
  return output.str();
}

std::string Renderer::piecePreview(tetris::PieceType piece) const {
  const auto cell = tetris::cellForPiece(piece);
  std::ostringstream output;
  if (color_) output << colorFor(cell);
  output << tetris::toString(piece);
  if (color_) output << "\x1b[0m";
  return output.str();
}

void Renderer::draw(const Game& game) const {
  std::vector<std::string> side(20);
  side[0] = std::string(" MODE   ") + modeName(game.mode());
  side[1] = " SCORE  " + std::to_string(game.score());
  side[2] = " LINES  " + std::to_string(game.lines()) +
            (game.mode() == GameMode::FortyLines ? " / 40" : "");
  side[3] = " LEVEL  " + std::to_string(game.level());
  side[4] = " TIME   " + formatElapsed(game.elapsed());
  side[5] = " PIECES " + std::to_string(game.pieces());
  side[6] = " REN    " + std::to_string(std::max(0, game.combo()));
  side[7] = std::string(" B2B    ") + (game.backToBackActive() ? "ACTIVE" : "-");
  side[8] = std::string(" INPUT  ") +
            (enhancedKeyboard_ ? "ENHANCED" : "LEGACY");
  side[9] = " HOLD   " +
            (game.holdPiece() ? piecePreview(*game.holdPiece()) : "-") +
            (game.holdAvailable() ? "" : "  LOCKED");
  side[11] = " NEXT";
  const auto next = game.nextPieces();
  for (std::size_t index = 0; index < next.size() && index < 5; ++index) {
    side[12 + index] = "   " + std::to_string(index + 1) + "  " +
                       piecePreview(next[index]);
  }
  if (!game.lastClear().empty()) side[18] = " " + game.lastClear();
  if (game.status() == GameStatus::Paused) side[19] = " *** PAUSED ***";

  std::ostringstream output;
  output << "\x1b[H";
  output << (color_ ? kTitleColor : "") << "        TETRIS CLI"
         << (color_ ? "\x1b[0m" : "") << "\x1b[K\n";
  output << (color_ ? std::string(kBorderColor) +
                           "┌────────────────────┐" + kReset
                    : "+--------------------+")
         << "\x1b[K\n";
  for (int visible = 0; visible < tetris::kVisibleBoardRows; ++visible) {
    const int row = tetris::kBoardRows - tetris::kVisibleBoardRows + visible;
    output << boardLine(game, row) << side[static_cast<std::size_t>(visible)]
           << "\x1b[K\n";
  }
  output << (color_ ? std::string(kBorderColor) +
                           "└────────────────────┘" + kReset
                    : "+--------------------+")
         << "\x1b[K\n";
  output << " " << keyLabel(bindings_.moveLeft) << "/"
         << keyLabel(bindings_.moveRight) << " move  "
         << keyLabel(bindings_.softDrop) << " soft x"
         << (softDropFactor_ == 0 ? "INF" : std::to_string(softDropFactor_))
         << "  "
         << keyLabel(bindings_.hardDrop) << " hard\x1b[K\n";
  output << " " << keyLabel(bindings_.rotateCounterClockwise) << "/"
         << keyLabel(bindings_.rotateClockwise) << "/"
         << keyLabel(bindings_.rotate180) << " rotate  "
         << keyLabel(bindings_.hold) << " hold  "
         << keyLabel(bindings_.pause) << " pause  "
         << keyLabel(bindings_.quit) << " quit\x1b[K\n\x1b[J";
  std::cout << output.str() << std::flush;
}

void Renderer::drawMenu(int selected) const {
  std::cout << "\x1b[H\x1b[2J"
            << (color_ ? kTitleColor : "")
            << "             TETRIS CLI\n"
            << (color_ ? "\x1b[0m" : "")
            << "\n  Select a game mode and press Enter\n\n"
            << (selected == 0 ? "  > " : "    ") << "MARATHON\n"
            << (selected == 1 ? "  > " : "    ") << "40 LINES\n\n"
            << "  UP/DOWN or 1/2: select    Q: quit\n"
            << std::flush;
}

void Renderer::drawCountdown(int value) const {
  std::cout << "\x1b[H\x1b[2J\n\n\n"
            << (color_ ? kAccentColor : "") << "             ";
  if (value > 0) {
    std::cout << value;
  } else {
    std::cout << "GO!";
  }
  std::cout << (color_ ? "\x1b[0m" : "") << std::flush;
}

void Renderer::drawEnd(const Game& game) const {
  draw(game);
  std::cout << '\n' << (color_ ? kAccentColor : "")
            << (game.status() == GameStatus::Cleared ? "  40 LINES CLEAR!"
                                                     : "  GAME OVER")
            << (color_ ? "\x1b[0m" : "") << "\n"
            << "  " << keyLabel(bindings_.restart) << " restart  "
            << keyLabel(bindings_.quit) << " quit\n"
            << std::flush;
}

}  // namespace tetris_cli
