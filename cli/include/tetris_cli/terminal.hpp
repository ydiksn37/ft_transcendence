#pragma once

#include <string>
#include <termios.h>
#include <vector>

namespace tetris_cli {

enum class KeyEventType { Press, Repeat, Release };

struct KeyEvent {
  std::string key;
  KeyEventType type = KeyEventType::Press;
};

class Terminal {
 public:
  Terminal();
  ~Terminal();

  Terminal(const Terminal&) = delete;
  Terminal& operator=(const Terminal&) = delete;

  [[nodiscard]] std::vector<KeyEvent> readKeys(int timeoutMilliseconds);
  [[nodiscard]] bool interactive() const noexcept { return interactive_; }
  [[nodiscard]] bool enhancedKeyboard() const noexcept {
    return enhancedKeyboard_;
  }

 private:
  void detectEnhancedKeyboard();

  bool interactive_ = false;
  bool enhancedKeyboard_ = false;
  termios original_{};
  std::string pending_;
};

}  // namespace tetris_cli
