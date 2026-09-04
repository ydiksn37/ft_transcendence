#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <optional>
#include <random>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_set>

#include "tetris_cli/config.hpp"
#include "tetris_cli/game.hpp"
#include "tetris_cli/renderer.hpp"
#include "tetris_cli/terminal.hpp"

#ifndef TETRIS_CLI_DEFAULT_CONFIG
#define TETRIS_CLI_DEFAULT_CONFIG "cli/config.json"
#endif

namespace {

volatile std::sig_atomic_t gInterrupted = 0;

void onInterrupt(int) { gInterrupted = 1; }

struct Options {
  std::string configPath = TETRIS_CLI_DEFAULT_CONFIG;
  std::optional<tetris_cli::GameMode> mode;
  std::optional<std::uint32_t> seed;
  bool countdown = true;
};

void printUsage(const char* executable) {
  std::cout << "Usage: " << executable << " [options]\n"
            << "  --config PATH             JSON key-binding config\n"
            << "  --mode marathon|40-lines  Skip the mode menu\n"
            << "  --seed UINT32             Reproducible 7-bag seed\n"
            << "  --no-countdown            Start immediately\n"
            << "  --help                    Show this help\n";
}

std::uint32_t parseSeed(const std::string& value) {
  std::size_t consumed = 0;
  const unsigned long long parsed = std::stoull(value, &consumed, 10);
  if (consumed != value.size() || parsed > 0xffffffffULL) {
    throw std::runtime_error("seed must be an unsigned 32-bit integer");
  }
  return static_cast<std::uint32_t>(parsed);
}

Options parseOptions(int argc, char** argv) {
  Options options;
  for (int index = 1; index < argc; ++index) {
    const std::string argument = argv[index];
    const auto requireValue = [&]() -> std::string {
      if (++index >= argc) throw std::runtime_error(argument + " needs a value");
      return argv[index];
    };
    if (argument == "--config") {
      options.configPath = requireValue();
    } else if (argument == "--mode") {
      const std::string mode = requireValue();
      if (mode == "marathon") {
        options.mode = tetris_cli::GameMode::Marathon;
      } else if (mode == "40-lines" || mode == "40line" || mode == "40") {
        options.mode = tetris_cli::GameMode::FortyLines;
      } else {
        throw std::runtime_error("mode must be marathon or 40-lines");
      }
    } else if (argument == "--seed") {
      options.seed = parseSeed(requireValue());
    } else if (argument == "--no-countdown") {
      options.countdown = false;
    } else if (argument == "--help" || argument == "-h") {
      printUsage(argv[0]);
      std::exit(EXIT_SUCCESS);
    } else {
      throw std::runtime_error("unknown option: " + argument);
    }
  }
  return options;
}

std::uint32_t randomSeed() {
  std::random_device device;
  return (static_cast<std::uint32_t>(device()) << 16U) ^
         static_cast<std::uint32_t>(device());
}

std::optional<tetris_cli::GameMode> selectMode(tetris_cli::Terminal& terminal,
                                                const tetris_cli::Renderer& renderer) {
  int selected = 0;
  renderer.drawMenu(selected);
  while (!gInterrupted) {
    for (const tetris_cli::KeyEvent& event : terminal.readKeys(100)) {
      if (event.type == tetris_cli::KeyEventType::Release) continue;
      const std::string& key = event.key;
      if (key == "up" || key == "left") {
        selected = 0;
        renderer.drawMenu(selected);
      } else if (key == "down" || key == "right") {
        selected = 1;
        renderer.drawMenu(selected);
      } else if (key == "1") {
        selected = 0;
        renderer.drawMenu(selected);
      } else if (key == "2") {
        selected = 1;
        renderer.drawMenu(selected);
      } else if (key == "enter") {
        return selected == 0 ? tetris_cli::GameMode::Marathon
                             : tetris_cli::GameMode::FortyLines;
      } else if (key == "q" || key == "escape") {
        return std::nullopt;
      }
    }
  }
  return std::nullopt;
}

void countdown(const tetris_cli::Renderer& renderer) {
  using namespace std::chrono_literals;
  for (int value = 3; value >= 0 && !gInterrupted; --value) {
    renderer.drawCountdown(value);
    std::this_thread::sleep_for(value == 0 ? 350ms : 650ms);
  }
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const Options options = parseOptions(argc, argv);
    const tetris_cli::Config config = tetris_cli::loadConfig(options.configPath);
    const auto actions = tetris_cli::actionMap(config.keys);

    std::signal(SIGINT, onInterrupt);
    std::signal(SIGTERM, onInterrupt);
    tetris_cli::Terminal terminal;
    if (!terminal.interactive()) {
      throw std::runtime_error("tetris_cli requires an interactive terminal");
    }
    const tetris_cli::Renderer renderer(
        config.color, config.keys, config.softDropFactor,
        terminal.enhancedKeyboard());

    const auto mode = options.mode ? options.mode : selectMode(terminal, renderer);
    if (!mode || gInterrupted) return EXIT_SUCCESS;
    if (options.countdown) countdown(renderer);

    std::uint32_t seed = options.seed.value_or(randomSeed());
    tetris_cli::Game game(*mode, seed);
    auto lastRender = tetris_cli::Game::Clock::time_point{};
    auto nextHorizontalRepeat = tetris_cli::Game::Clock::time_point{};
    auto nextSoftDrop = tetris_cli::Game::Clock::time_point{};
    tetris_cli::GameAction horizontalAction =
        tetris_cli::GameAction::MoveLeft;
    bool horizontalActive = false;
    std::optional<std::string> horizontalKey;
    std::unordered_set<std::string> heldKeys;
    bool softDropHeld = false;
    bool quit = false;

    const std::string leftKey =
        tetris_cli::normalizeKeyName(config.keys.moveLeft);
    const std::string rightKey =
        tetris_cli::normalizeKeyName(config.keys.moveRight);
    const std::string softDropKey =
        tetris_cli::normalizeKeyName(config.keys.softDrop);
    const auto applySoftDrop = [&](tetris_cli::Game::TimePoint now) {
      const int cells = config.softDropFactor == 0
                            ? tetris::kBoardRows
                            : config.softDropFactor;
      for (int cell = 0; cell < cells; ++cell) {
        game.dispatch(tetris_cli::GameAction::SoftDrop, now);
      }
    };

    while (!quit && !gInterrupted) {
      const auto now = tetris_cli::Game::Clock::now();
      bool dirty = false;
      for (const tetris_cli::KeyEvent& event : terminal.readKeys(8)) {
        const auto action = actions.find(event.key);
        if (action == actions.end()) continue;
        const bool enhanced = terminal.enhancedKeyboard();

        if (enhanced && event.type == tetris_cli::KeyEventType::Release) {
          heldKeys.erase(event.key);
          if (event.key == softDropKey) softDropHeld = false;
          if (horizontalKey && *horizontalKey == event.key) {
            horizontalActive = false;
            horizontalKey.reset();
            if (heldKeys.count(leftKey) != 0) {
              horizontalKey = leftKey;
              horizontalAction = tetris_cli::GameAction::MoveLeft;
              horizontalActive = true;
            } else if (heldKeys.count(rightKey) != 0) {
              horizontalKey = rightKey;
              horizontalAction = tetris_cli::GameAction::MoveRight;
              horizontalActive = true;
            }
            if (horizontalActive) {
              game.dispatch(horizontalAction, now);
              nextHorizontalRepeat =
                  now + std::chrono::milliseconds(config.dasMilliseconds);
              dirty = true;
            }
          }
          continue;
        }
        if (enhanced && event.type == tetris_cli::KeyEventType::Press) {
          heldKeys.insert(event.key);
        }

        if (action->second == tetris_cli::GameAction::Quit) {
          if (event.type == tetris_cli::KeyEventType::Press) quit = true;
          break;
        }
        if (enhanced &&
            (action->second == tetris_cli::GameAction::MoveLeft ||
             action->second == tetris_cli::GameAction::MoveRight)) {
          if (event.type == tetris_cli::KeyEventType::Press) {
            horizontalKey = event.key;
            horizontalAction = action->second;
            horizontalActive = true;
            game.dispatch(action->second, now);
            nextHorizontalRepeat =
                now + std::chrono::milliseconds(config.dasMilliseconds);
            dirty = true;
          }
          continue;
        }
        if (enhanced && action->second == tetris_cli::GameAction::SoftDrop) {
          if (event.type == tetris_cli::KeyEventType::Press) {
            softDropHeld = true;
            applySoftDrop(now);
            nextSoftDrop = now + std::chrono::milliseconds(
                                     config.softDropIntervalMilliseconds);
            dirty = true;
          }
          continue;
        }
        if (enhanced && event.type == tetris_cli::KeyEventType::Repeat) {
          continue;
        }
        if (action->second == tetris_cli::GameAction::Restart) {
          seed = options.seed.value_or(randomSeed());
          if ((game.status() == tetris_cli::GameStatus::GameOver ||
               game.status() == tetris_cli::GameStatus::Cleared) &&
              options.countdown) {
            countdown(renderer);
          }
          game.restart(seed, tetris_cli::Game::Clock::now());
          dirty = true;
        } else if (action->second == tetris_cli::GameAction::SoftDrop) {
          applySoftDrop(now);
          dirty = true;
        } else {
          game.dispatch(action->second, now);
          dirty = true;
        }
      }

      if (terminal.enhancedKeyboard() && horizontalActive && horizontalKey &&
          heldKeys.count(*horizontalKey) != 0 && now >= nextHorizontalRepeat) {
        if (config.arrMilliseconds == 0) {
          for (int column = 0; column < tetris::kBoardCols; ++column) {
            game.dispatch(horizontalAction, now);
          }
          nextHorizontalRepeat = tetris_cli::Game::TimePoint::max();
        } else {
          int repeats = 0;
          while (now >= nextHorizontalRepeat && repeats < tetris::kBoardCols) {
            game.dispatch(horizontalAction, now);
            nextHorizontalRepeat +=
                std::chrono::milliseconds(config.arrMilliseconds);
            ++repeats;
          }
        }
        dirty = true;
      }
      if (terminal.enhancedKeyboard() && softDropHeld &&
          heldKeys.count(softDropKey) != 0 && now >= nextSoftDrop) {
        int repeats = 0;
        const auto interval = std::chrono::milliseconds(
            config.softDropIntervalMilliseconds);
        while (now >= nextSoftDrop && repeats < tetris::kBoardRows) {
          applySoftDrop(now);
          nextSoftDrop += interval;
          ++repeats;
        }
        dirty = true;
      }
      game.tick(tetris_cli::Game::Clock::now());

      const auto renderNow = tetris_cli::Game::Clock::now();
      if (dirty || lastRender.time_since_epoch().count() == 0 ||
          renderNow - lastRender >= std::chrono::milliseconds(100)) {
        if (game.status() == tetris_cli::GameStatus::GameOver ||
            game.status() == tetris_cli::GameStatus::Cleared) {
          renderer.drawEnd(game);
        } else {
          renderer.draw(game);
        }
        lastRender = renderNow;
      }
    }
    return EXIT_SUCCESS;
  } catch (const std::exception& error) {
    std::cerr << "tetris_cli: " << error.what() << '\n';
    return EXIT_FAILURE;
  }
}
