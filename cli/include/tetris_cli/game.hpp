#pragma once

#include <chrono>
#include <cstdint>
#include <deque>
#include <optional>
#include <string>
#include <vector>

#include "tetris/bag.hpp"
#include "tetris/board.hpp"

namespace tetris_cli {

enum class GameMode { Marathon, FortyLines };
enum class GameStatus { Playing, Paused, Cleared, GameOver };
enum class GameAction {
  MoveLeft,
  MoveRight,
  SoftDrop,
  HardDrop,
  RotateClockwise,
  RotateCounterClockwise,
  Rotate180,
  Hold,
  Pause,
  Restart,
  Quit,
};

struct LockScoreInput {
  int lines = 0;
  std::optional<tetris::TSpin> tSpin;
  bool backToBack = false;
  bool perfectClear = false;
  int combo = -1;
  int level = 1;
};

struct LockScore {
  int points = 0;
  std::string label;
};

[[nodiscard]] LockScore calculateLockScore(const LockScoreInput& input);
[[nodiscard]] std::chrono::milliseconds gravityInterval(int level);
[[nodiscard]] const char* modeName(GameMode mode) noexcept;

class Game {
 public:
  using Clock = std::chrono::steady_clock;
  using TimePoint = Clock::time_point;

  Game(GameMode mode, std::uint32_t seed, TimePoint now = Clock::now());

  void dispatch(GameAction action, TimePoint now = Clock::now());
  void tick(TimePoint now = Clock::now());
  void restart(std::uint32_t seed, TimePoint now = Clock::now());

  [[nodiscard]] GameMode mode() const noexcept { return mode_; }
  [[nodiscard]] GameStatus status() const noexcept { return status_; }
  [[nodiscard]] const tetris::Board& board() const noexcept { return board_; }
  [[nodiscard]] const tetris::ActivePiece& activePiece() const noexcept {
    return active_;
  }
  [[nodiscard]] int ghostY() const noexcept;
  [[nodiscard]] std::optional<tetris::PieceType> holdPiece() const noexcept {
    return hold_;
  }
  [[nodiscard]] bool holdAvailable() const noexcept { return canHold_; }
  [[nodiscard]] std::vector<tetris::PieceType> nextPieces(
      std::size_t count = 5) const;
  [[nodiscard]] int score() const noexcept { return score_; }
  [[nodiscard]] int lines() const noexcept { return lines_; }
  [[nodiscard]] int level() const noexcept { return level_; }
  [[nodiscard]] int pieces() const noexcept { return pieces_; }
  [[nodiscard]] int combo() const noexcept { return combo_; }
  [[nodiscard]] bool backToBackActive() const noexcept { return backToBack_; }
  [[nodiscard]] const std::string& lastClear() const noexcept {
    return lastClear_;
  }
  [[nodiscard]] std::uint32_t seed() const noexcept { return seed_; }
  [[nodiscard]] std::chrono::milliseconds elapsed(
      TimePoint now = Clock::now()) const noexcept;

 private:
  static constexpr std::chrono::milliseconds kLockDelay{500};
  static constexpr int kMaxLockResets = 15;

  void ensureNext(std::size_t count);
  void spawnNext(TimePoint now);
  void spawn(tetris::PieceType type, TimePoint now);
  bool move(int dx, int dy, TimePoint now, bool manual);
  void rotate(tetris::RotationDirection direction, TimePoint now);
  void refreshGroundedState(TimePoint now, bool allowReset);
  void lock(TimePoint now);
  void togglePause(TimePoint now);

  GameMode mode_;
  GameStatus status_ = GameStatus::Playing;
  std::uint32_t seed_;
  tetris::Board board_;
  tetris::BagGenerator bag_;
  std::deque<tetris::PieceType> next_;
  tetris::ActivePiece active_{tetris::PieceType::I, 3, tetris::kSpawnY, 0};
  std::optional<tetris::PieceType> hold_;
  bool canHold_ = true;
  bool hasActivePiece_ = false;

  int score_ = 0;
  int lines_ = 0;
  int level_ = 1;
  int pieces_ = 0;
  int combo_ = -1;
  bool backToBack_ = false;
  std::string lastClear_;

  bool lastMoveWasRotation_ = false;
  int lastRotationKickIndex_ = 0;
  int lowestY_ = tetris::kSpawnY;
  int lockResets_ = 0;
  std::optional<TimePoint> groundedSince_;
  TimePoint nextGravity_;
  TimePoint startedAt_;
  TimePoint pauseStarted_;
  TimePoint endedAt_;
  std::chrono::milliseconds pausedDuration_{0};
};

}  // namespace tetris_cli
