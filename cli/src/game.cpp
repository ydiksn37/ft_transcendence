#include "tetris_cli/game.hpp"

#include <algorithm>
#include <cmath>
#include <sstream>

namespace tetris_cli {
namespace {

bool isPerfectClear(const tetris::Board& board) noexcept { return board.empty(); }

int baseScore(const LockScoreInput& input, std::string& label) {
  if (input.tSpin == tetris::TSpin::Full) {
    static constexpr int kScores[]{400, 800, 1200, 1600};
    static constexpr const char* kLabels[]{"T-SPIN", "T-SPIN SINGLE",
                                           "T-SPIN DOUBLE", "T-SPIN TRIPLE"};
    if (input.lines >= 0 && input.lines <= 3) {
      label = kLabels[input.lines];
      return kScores[input.lines];
    }
  } else if (input.tSpin == tetris::TSpin::Mini) {
    static constexpr int kScores[]{100, 200, 400};
    static constexpr const char* kLabels[]{"T-SPIN MINI", "MINI SINGLE",
                                           "MINI DOUBLE"};
    if (input.lines >= 0 && input.lines <= 2) {
      label = kLabels[input.lines];
      return kScores[input.lines];
    }
  } else {
    static constexpr int kScores[]{0, 100, 300, 500, 800};
    static constexpr const char* kLabels[]{"", "SINGLE", "DOUBLE", "TRIPLE",
                                           "TETRIS"};
    if (input.lines >= 0 && input.lines <= 4) {
      label = kLabels[input.lines];
      return kScores[input.lines];
    }
  }
  return 0;
}

}  // namespace

LockScore calculateLockScore(const LockScoreInput& input) {
  LockScore result;
  int base = baseScore(input, result.label);

  if (input.backToBack && input.lines > 0) {
    base = static_cast<int>(std::floor(static_cast<double>(base) * 1.5));
    if (!result.label.empty()) result.label = "B2B " + result.label;
  }

  if (input.perfectClear) {
    static constexpr int kPerfectClearBonus[]{0, 800, 1200, 1800, 2000};
    if (input.lines >= 1 && input.lines <= 4) {
      base += kPerfectClearBonus[input.lines];
      result.label = result.label.empty() ? "PERFECT CLEAR"
                                          : "PERFECT CLEAR / " + result.label;
    }
  }

  const int comboPoints = input.combo > 0 ? 50 * input.combo * input.level : 0;
  if (input.combo > 0) {
    std::ostringstream suffix;
    suffix << input.combo << " REN";
    result.label = result.label.empty() ? suffix.str()
                                        : result.label + " / " + suffix.str();
  }
  result.points = base * input.level + comboPoints;
  return result;
}

std::chrono::milliseconds gravityInterval(int level) {
  const double base = std::max(0.0, 0.8 - static_cast<double>(level - 1) * 0.007);
  const double milliseconds = std::pow(base, level - 1) * 1000.0;
  return std::chrono::milliseconds(
      std::max(1LL, static_cast<long long>(std::llround(milliseconds))));
}

const char* modeName(GameMode mode) noexcept {
  return mode == GameMode::Marathon ? "MARATHON" : "40 LINES";
}

Game::Game(GameMode mode, std::uint32_t seed, TimePoint now)
    : mode_(mode),
      seed_(seed),
      bag_(seed),
      nextGravity_(now + gravityInterval(1)),
      startedAt_(now),
      pauseStarted_(now),
      endedAt_(now) {
  ensureNext(6);
  spawnNext(now);
}

void Game::restart(std::uint32_t seed, TimePoint now) {
  *this = Game(mode_, seed, now);
}

void Game::ensureNext(std::size_t count) {
  while (next_.size() < count) next_.push_back(bag_.next());
}

void Game::spawnNext(TimePoint now) {
  ensureNext(6);
  const tetris::PieceType type = next_.front();
  next_.pop_front();
  ensureNext(5);
  spawn(type, now);
}

void Game::spawn(tetris::PieceType type, TimePoint now) {
  active_ = {type, 3, tetris::kSpawnY - 1, 0};
  if (!tetris::isValidPosition(board_, active_)) {
    status_ = GameStatus::GameOver;
    hasActivePiece_ = false;
    endedAt_ = now;
    return;
  }
  tetris::ActivePiece oneRowDown = active_;
  ++oneRowDown.y;
  if (tetris::isValidPosition(board_, oneRowDown)) active_ = oneRowDown;

  hasActivePiece_ = true;
  lastMoveWasRotation_ = false;
  lastRotationKickIndex_ = 0;
  lowestY_ = active_.y;
  lockResets_ = 0;
  groundedSince_.reset();
  nextGravity_ = now + gravityInterval(level_);
  refreshGroundedState(now, false);
}

int Game::ghostY() const noexcept {
  return hasActivePiece_ ? tetris::calcGhostY(board_, active_) : active_.y;
}

std::vector<tetris::PieceType> Game::nextPieces(std::size_t count) const {
  count = std::min(count, next_.size());
  return {next_.begin(), next_.begin() + static_cast<std::ptrdiff_t>(count)};
}

bool Game::move(int dx, int dy, TimePoint now, bool manual) {
  if (!hasActivePiece_) return false;
  const bool wasGrounded = groundedSince_.has_value();
  tetris::ActivePiece moved = active_;
  moved.x += dx;
  moved.y += dy;
  if (!tetris::isValidPosition(board_, moved)) {
    if (dy > 0) refreshGroundedState(now, false);
    return false;
  }

  active_ = moved;
  lastMoveWasRotation_ = false;
  if (manual && dy > 0) score_ += dy;
  if (active_.y > lowestY_) {
    lowestY_ = active_.y;
    lockResets_ = 0;
  }
  refreshGroundedState(now, manual && wasGrounded);
  return true;
}

void Game::rotate(tetris::RotationDirection direction, TimePoint now) {
  if (!hasActivePiece_) return;
  const bool wasGrounded = groundedSince_.has_value();

  // The frontend treats O rotation as a successful rotate for lock-delay reset.
  if (active_.type == tetris::PieceType::O) {
    lastMoveWasRotation_ = true;
    lastRotationKickIndex_ = 0;
    refreshGroundedState(now, wasGrounded);
    return;
  }

  int kickIndex = -1;
  const auto rotated = tetris::tryRotate(board_, active_, direction, &kickIndex);
  if (!rotated) return;
  active_ = *rotated;
  lastMoveWasRotation_ = true;
  lastRotationKickIndex_ = kickIndex;
  if (active_.y > lowestY_) {
    lowestY_ = active_.y;
    lockResets_ = 0;
  }
  refreshGroundedState(now, wasGrounded);
}

void Game::refreshGroundedState(TimePoint now, bool allowReset) {
  if (!hasActivePiece_) return;
  tetris::ActivePiece below = active_;
  ++below.y;
  const bool grounded = !tetris::isValidPosition(board_, below);
  if (!grounded) {
    groundedSince_.reset();
    return;
  }
  if (!groundedSince_) {
    groundedSince_ = now;
    return;
  }
  if (allowReset && lockResets_ < kMaxLockResets) {
    ++lockResets_;
    groundedSince_ = now;
  }
}

void Game::lock(TimePoint now) {
  if (!hasActivePiece_) return;

  const tetris::Board locked = tetris::lockMino(board_, active_);
  const tetris::ClearResult clear = tetris::clearLines(locked);
  const auto spin = tetris::detectTSpin(board_, active_, lastMoveWasRotation_,
                                        lastRotationKickIndex_, clear.linesCleared);

  int maximumRow = -1;
  for (const auto cell : tetris::getMinoCells(active_)) {
    maximumRow = std::max(maximumRow, cell.row);
  }
  const int visibleStart = tetris::kBoardRows - tetris::kVisibleBoardRows;
  if (clear.linesCleared == 0 && maximumRow < visibleStart) {
    status_ = GameStatus::GameOver;
    hasActivePiece_ = false;
    endedAt_ = now;
    lastClear_ = "LOCK OUT";
    return;
  }

  board_ = clear.board;
  ++pieces_;
  if (clear.linesCleared > 0) {
    ++combo_;
  } else {
    combo_ = -1;
  }

  const bool difficult = clear.linesCleared == 4 || spin.has_value();
  bool receivesBackToBackBonus = false;
  if (clear.linesCleared > 0) {
    if (difficult) {
      receivesBackToBackBonus = backToBack_;
      backToBack_ = true;
    } else {
      backToBack_ = false;
    }
  }

  const LockScore scored = calculateLockScore(
      {clear.linesCleared, spin, receivesBackToBackBonus,
       clear.linesCleared > 0 && isPerfectClear(board_), combo_, level_});
  score_ += scored.points;
  lastClear_ = scored.label;
  lines_ += clear.linesCleared;
  level_ = lines_ / 10 + 1;
  canHold_ = true;
  hasActivePiece_ = false;

  if (mode_ == GameMode::FortyLines && lines_ >= 40) {
    status_ = GameStatus::Cleared;
    endedAt_ = now;
    return;
  }
  spawnNext(now);
}

void Game::togglePause(TimePoint now) {
  if (status_ == GameStatus::Playing) {
    status_ = GameStatus::Paused;
    pauseStarted_ = now;
  } else if (status_ == GameStatus::Paused) {
    const auto duration =
        std::chrono::duration_cast<std::chrono::milliseconds>(now - pauseStarted_);
    pausedDuration_ += duration;
    nextGravity_ += duration;
    if (groundedSince_) *groundedSince_ += duration;
    status_ = GameStatus::Playing;
  }
}

void Game::dispatch(GameAction action, TimePoint now) {
  if (action == GameAction::Pause) {
    if (status_ == GameStatus::Playing || status_ == GameStatus::Paused) {
      togglePause(now);
    }
    return;
  }
  if (action == GameAction::Restart) {
    restart(seed_, now);
    return;
  }
  if (status_ != GameStatus::Playing || !hasActivePiece_) return;

  switch (action) {
    case GameAction::MoveLeft:
      move(-1, 0, now, true);
      break;
    case GameAction::MoveRight:
      move(1, 0, now, true);
      break;
    case GameAction::SoftDrop:
      move(0, 1, now, true);
      break;
    case GameAction::HardDrop: {
      const int targetY = tetris::calcGhostY(board_, active_);
      const int distance = targetY - active_.y;
      active_.y = targetY;
      score_ += distance * 2;
      if (distance > 0) lastMoveWasRotation_ = false;
      lock(now);
      break;
    }
    case GameAction::RotateClockwise:
      rotate(tetris::RotationDirection::Clockwise, now);
      break;
    case GameAction::RotateCounterClockwise:
      rotate(tetris::RotationDirection::CounterClockwise, now);
      break;
    case GameAction::Rotate180:
      rotate(tetris::RotationDirection::Rotate180, now);
      break;
    case GameAction::Hold: {
      if (!canHold_) break;
      const tetris::PieceType outgoing = active_.type;
      canHold_ = false;
      if (hold_) {
        const tetris::PieceType incoming = *hold_;
        hold_ = outgoing;
        spawn(incoming, now);
      } else {
        hold_ = outgoing;
        spawnNext(now);
      }
      // spawn() intentionally does not alter the once-per-piece hold lock.
      canHold_ = false;
      break;
    }
    case GameAction::Pause:
    case GameAction::Restart:
    case GameAction::Quit:
      break;
  }
}

void Game::tick(TimePoint now) {
  if (status_ != GameStatus::Playing || !hasActivePiece_) return;

  int steps = 0;
  while (now >= nextGravity_ && steps < tetris::kBoardRows) {
    const TimePoint stepTime = nextGravity_;
    nextGravity_ += gravityInterval(level_);
    if (!move(0, 1, stepTime, false)) break;
    ++steps;
  }

  if (groundedSince_ && now - *groundedSince_ >= kLockDelay) lock(now);
}

std::chrono::milliseconds Game::elapsed(TimePoint now) const noexcept {
  TimePoint end = now;
  auto paused = pausedDuration_;
  if (status_ == GameStatus::GameOver || status_ == GameStatus::Cleared) {
    end = endedAt_;
  } else if (status_ == GameStatus::Paused) {
    end = pauseStarted_;
  }
  return std::chrono::duration_cast<std::chrono::milliseconds>(end - startedAt_) -
         paused;
}

}  // namespace tetris_cli
