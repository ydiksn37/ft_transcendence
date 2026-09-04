#include "tetris_cli/terminal.hpp"

#include <poll.h>
#include <unistd.h>

#include <charconv>
#include <cerrno>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string_view>

#include "tetris_cli/config.hpp"

namespace tetris_cli {
namespace {

std::optional<int> parseInteger(std::string_view value) {
  int result = 0;
  const auto parsed =
      std::from_chars(value.data(), value.data() + value.size(), result);
  if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size()) {
    return std::nullopt;
  }
  return result;
}

KeyEventType eventTypeFromParameters(std::string_view parameters) {
  const std::size_t semicolon = parameters.find(';');
  if (semicolon == std::string_view::npos) return KeyEventType::Press;
  const std::size_t colon = parameters.find(':', semicolon);
  if (colon == std::string_view::npos) return KeyEventType::Press;
  const std::size_t end = parameters.find(';', colon + 1);
  const auto event = parseInteger(parameters.substr(
      colon + 1, end == std::string_view::npos ? end : end - colon - 1));
  if (event == 2) return KeyEventType::Repeat;
  if (event == 3) return KeyEventType::Release;
  return KeyEventType::Press;
}

std::optional<std::string> kittyKeyName(std::string_view parameters) {
  const std::size_t end = parameters.find_first_of(":;");
  const auto code = parseInteger(parameters.substr(0, end));
  if (!code) return std::nullopt;

  switch (*code) {
    case 57344:
    case 27: return "escape";
    case 57345:
    case 13: return "enter";
    case 57350: return "left";
    case 57351: return "right";
    case 57352: return "up";
    case 57353: return "down";
    case 32: return "space";
    default: break;
  }
  if (*code >= 32 && *code < 127) {
    return normalizeKeyName(std::string(1, static_cast<char>(*code)));
  }
  return std::nullopt;
}

}  // namespace

Terminal::Terminal() : interactive_(::isatty(STDIN_FILENO) != 0) {
  if (!interactive_) return;
  if (::tcgetattr(STDIN_FILENO, &original_) != 0) {
    throw std::runtime_error("failed to read terminal settings");
  }
  termios raw = original_;
  raw.c_lflag &= static_cast<tcflag_t>(~(ICANON | ECHO));
  raw.c_iflag &= static_cast<tcflag_t>(~(IXON | ICRNL));
  raw.c_cc[VMIN] = 0;
  raw.c_cc[VTIME] = 0;
  if (::tcsetattr(STDIN_FILENO, TCSAFLUSH, &raw) != 0) {
    throw std::runtime_error("failed to enable raw terminal mode");
  }
  detectEnhancedKeyboard();
  std::cout << "\x1b[?25l" << std::flush;
}

Terminal::~Terminal() {
  if (!interactive_) return;
  if (enhancedKeyboard_) std::cout << "\x1b[<u";
  ::tcsetattr(STDIN_FILENO, TCSAFLUSH, &original_);
  std::cout << "\x1b[0m\x1b[?25h\n" << std::flush;
}

void Terminal::detectEnhancedKeyboard() {
  // Query Kitty's progressive keyboard enhancement flags. Unsupported
  // terminals ignore this sequence and continue through the legacy path.
  std::cout << "\x1b[?u" << std::flush;
  pollfd descriptor{STDIN_FILENO, POLLIN, 0};
  const int result = ::poll(&descriptor, 1, 40);
  if (result <= 0 || (descriptor.revents & POLLIN) == 0) return;

  char buffer[128];
  const ssize_t count = ::read(STDIN_FILENO, buffer, sizeof(buffer));
  if (count <= 0) return;
  pending_.append(buffer, static_cast<std::size_t>(count));

  const std::size_t start = pending_.find("\x1b[?");
  if (start == std::string::npos) return;
  const std::size_t end = pending_.find('u', start + 3);
  if (end == std::string::npos) return;
  const auto flags = parseInteger(std::string_view(pending_).substr(
      start + 3, end - start - 3));
  if (!flags) return;

  pending_.erase(start, end - start + 1);
  enhancedKeyboard_ = true;
  // Disambiguate escape codes + report press/repeat/release event types.
  std::cout << "\x1b[>3u" << std::flush;
}

std::vector<KeyEvent> Terminal::readKeys(int timeoutMilliseconds) {
  std::vector<KeyEvent> keys;
  if (!interactive_) return keys;

  pollfd descriptor{STDIN_FILENO, POLLIN, 0};
  const int result = ::poll(&descriptor, 1, timeoutMilliseconds);
  if (result < 0) {
    if (errno == EINTR) return keys;
    throw std::runtime_error("terminal input polling failed");
  }
  if (result > 0 && (descriptor.revents & POLLIN) != 0) {
    char buffer[128];
    const ssize_t count = ::read(STDIN_FILENO, buffer, sizeof(buffer));
    if (count > 0) pending_.append(buffer, static_cast<std::size_t>(count));
  }

  std::size_t index = 0;
  while (index < pending_.size()) {
    const unsigned char byte = static_cast<unsigned char>(pending_[index]);
    if (byte == 0x1b) {
      if (index + 1 >= pending_.size()) {
        if (result > 0) break;
        keys.push_back({"escape", KeyEventType::Press});
        ++index;
        continue;
      }
      if (pending_[index + 1] != '[') {
        keys.push_back({"escape", KeyEventType::Press});
        ++index;
        continue;
      }

      std::size_t final = index + 2;
      while (final < pending_.size()) {
        const unsigned char candidate =
            static_cast<unsigned char>(pending_[final]);
        if (candidate >= 0x40 && candidate <= 0x7e) break;
        ++final;
      }
      if (final >= pending_.size()) break;

      const char finalByte = pending_[final];
      const std::string_view parameters(pending_.data() + index + 2,
                                        final - index - 2);
      const KeyEventType type = eventTypeFromParameters(parameters);
      std::optional<std::string> key;
      switch (finalByte) {
        case 'A': key = "up"; break;
        case 'B': key = "down"; break;
        case 'C': key = "right"; break;
        case 'D': key = "left"; break;
        case 'u': key = kittyKeyName(parameters); break;
        default: break;
      }
      if (key) keys.push_back({*key, type});
      index = final + 1;
      continue;
    }

    if (byte == ' ') {
      keys.push_back({"space", KeyEventType::Press});
    } else if (byte == '\r' || byte == '\n') {
      keys.push_back({"enter", KeyEventType::Press});
    } else if (byte >= 32 && byte < 127) {
      std::string key(1, static_cast<char>(byte));
      keys.push_back({normalizeKeyName(std::move(key)), KeyEventType::Press});
    }
    ++index;
  }
  pending_.erase(0, index);
  return keys;
}

}  // namespace tetris_cli
