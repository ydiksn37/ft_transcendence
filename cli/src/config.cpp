#include "tetris_cli/config.hpp"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <set>
#include <stdexcept>

#include <nlohmann/json.hpp>

namespace tetris_cli {
namespace {

void loadBinding(const nlohmann::json& object, const char* name,
                 std::string& destination) {
  const auto iterator = object.find(name);
  if (iterator == object.end()) return;
  if (!iterator->is_string()) {
    throw std::runtime_error(std::string("keyBindings.") + name +
                             " must be a string");
  }
  destination = normalizeKeyName(iterator->get<std::string>());
}

void loadInteger(const nlohmann::json& object, const char* name,
                 int minimum, int maximum, int& destination) {
  const auto iterator = object.find(name);
  if (iterator == object.end()) return;
  if (!iterator->is_number_integer()) {
    throw std::runtime_error(std::string(name) + " must be an integer");
  }
  destination = iterator->get<int>();
  if (destination < minimum || destination > maximum) {
    throw std::runtime_error(std::string(name) + " must be between " +
                             std::to_string(minimum) + " and " +
                             std::to_string(maximum));
  }
}

bool isSupportedKey(const std::string& key) {
  static const std::set<std::string> kNamedKeys{
      "left", "right", "up", "down", "space", "enter", "escape"};
  return key.size() == 1 || kNamedKeys.count(key) != 0;
}

}  // namespace

std::string normalizeKeyName(std::string key) {
  std::transform(key.begin(), key.end(), key.begin(), [](unsigned char value) {
    return static_cast<char>(std::tolower(value));
  });
  if (key == "arrowleft") return "left";
  if (key == "arrowright") return "right";
  if (key == "arrowup") return "up";
  if (key == "arrowdown") return "down";
  if (key == "esc") return "escape";
  return key;
}

Config loadConfig(const std::string& path) {
  std::ifstream input(path);
  if (!input) {
    throw std::runtime_error("cannot open CLI config: " + path);
  }

  nlohmann::json document;
  try {
    input >> document;
  } catch (const nlohmann::json::exception& error) {
    throw std::runtime_error("invalid JSON in " + path + ": " + error.what());
  }
  if (!document.is_object()) throw std::runtime_error("CLI config must be an object");

  Config config;
  if (const auto color = document.find("color"); color != document.end()) {
    if (!color->is_boolean()) throw std::runtime_error("color must be a boolean");
    config.color = color->get<bool>();
  }
  loadInteger(document, "softDropFactor", 0, tetris::kBoardRows,
              config.softDropFactor);
  loadInteger(document, "dasMilliseconds", 0, 1000,
              config.dasMilliseconds);
  loadInteger(document, "arrMilliseconds", 0, 1000,
              config.arrMilliseconds);
  loadInteger(document, "softDropIntervalMilliseconds", 1, 1000,
              config.softDropIntervalMilliseconds);

  if (const auto keys = document.find("keyBindings"); keys != document.end()) {
    if (!keys->is_object()) {
      throw std::runtime_error("keyBindings must be an object");
    }
    loadBinding(*keys, "moveLeft", config.keys.moveLeft);
    loadBinding(*keys, "moveRight", config.keys.moveRight);
    loadBinding(*keys, "softDrop", config.keys.softDrop);
    loadBinding(*keys, "hardDrop", config.keys.hardDrop);
    loadBinding(*keys, "rotateCW", config.keys.rotateClockwise);
    loadBinding(*keys, "rotateCCW", config.keys.rotateCounterClockwise);
    loadBinding(*keys, "rotate180", config.keys.rotate180);
    loadBinding(*keys, "hold", config.keys.hold);
    loadBinding(*keys, "pause", config.keys.pause);
    loadBinding(*keys, "restart", config.keys.restart);
    loadBinding(*keys, "quit", config.keys.quit);
  }

  const auto bindings = actionMap(config.keys);
  if (bindings.size() != 11) {
    throw std::runtime_error("every key binding must be unique");
  }
  for (const auto& [key, action] : bindings) {
    (void)action;
    if (!isSupportedKey(key)) {
      throw std::runtime_error("unsupported terminal key: " + key);
    }
  }
  return config;
}

std::unordered_map<std::string, GameAction> actionMap(
    const KeyBindings& bindings) {
  return {
      {normalizeKeyName(bindings.moveLeft), GameAction::MoveLeft},
      {normalizeKeyName(bindings.moveRight), GameAction::MoveRight},
      {normalizeKeyName(bindings.softDrop), GameAction::SoftDrop},
      {normalizeKeyName(bindings.hardDrop), GameAction::HardDrop},
      {normalizeKeyName(bindings.rotateClockwise), GameAction::RotateClockwise},
      {normalizeKeyName(bindings.rotateCounterClockwise),
       GameAction::RotateCounterClockwise},
      {normalizeKeyName(bindings.rotate180), GameAction::Rotate180},
      {normalizeKeyName(bindings.hold), GameAction::Hold},
      {normalizeKeyName(bindings.pause), GameAction::Pause},
      {normalizeKeyName(bindings.restart), GameAction::Restart},
      {normalizeKeyName(bindings.quit), GameAction::Quit},
  };
}

}  // namespace tetris_cli
