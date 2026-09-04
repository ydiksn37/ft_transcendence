#pragma once

#include <string>
#include <unordered_map>

#include "tetris_cli/game.hpp"

namespace tetris_cli {

struct KeyBindings {
  std::string moveLeft = "left";
  std::string moveRight = "right";
  std::string softDrop = "down";
  std::string hardDrop = "space";
  std::string rotateClockwise = "x";
  std::string rotateCounterClockwise = "z";
  std::string rotate180 = "a";
  std::string hold = "c";
  std::string pause = "p";
  std::string restart = "r";
  std::string quit = "q";
};

struct Config {
  KeyBindings keys;
  bool color = true;
  // Matches the frontend SDF: cells per input, with 0 meaning infinity.
  int softDropFactor = 6;
  int dasMilliseconds = 133;
  int arrMilliseconds = 33;
  int softDropIntervalMilliseconds = 33;
};

[[nodiscard]] Config loadConfig(const std::string& path);
[[nodiscard]] std::unordered_map<std::string, GameAction> actionMap(
    const KeyBindings& bindings);
[[nodiscard]] std::string normalizeKeyName(std::string key);

}  // namespace tetris_cli
