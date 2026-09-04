#pragma once

#include <string>

#include "tetris_cli/config.hpp"
#include "tetris_cli/game.hpp"

namespace tetris_cli {

class Renderer {
 public:
  Renderer(bool color, const KeyBindings& bindings, int softDropFactor,
           bool enhancedKeyboard);

  void draw(const Game& game) const;
  void drawMenu(int selected) const;
  void drawCountdown(int value) const;
  void drawEnd(const Game& game) const;

 private:
  [[nodiscard]] std::string boardLine(const Game& game, int row) const;
  [[nodiscard]] std::string piecePreview(tetris::PieceType piece) const;

  bool color_;
  KeyBindings bindings_;
  int softDropFactor_;
  bool enhancedKeyboard_;
};

}  // namespace tetris_cli
