#include "tetris/game_simulator.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <optional>

#include "tetris/bag.hpp"

namespace tetris {
namespace {

enum class ClearKind {
  None,
  Single,
  Double,
  Triple,
  Tetris,
  TSpinMini,
  TSpinSingle,
  TSpinDouble,
  TSpinTriple,
  PerfectClear,
};

struct ReplayResult {
  ActivePiece placement;
  bool lastMoveWasRotation;
  int dropScore;
  bool valid;
};

ReplayResult replayDecision(const Board& board, PieceType type,
                            const AgentDecision& decision) {
  ActivePiece active{type, 3, 0, 0};
  bool lastMoveWasRotation = false;
  int dropScore = 0;
  bool locked = false;

  for (const Action action : decision.actions) {
    if (locked) return {active, lastMoveWasRotation, dropScore, false};
    ActivePiece moved = active;
    switch (action) {
      case Action::MoveLeft:
        --moved.x;
        lastMoveWasRotation = false;
        break;
      case Action::MoveRight:
        ++moved.x;
        lastMoveWasRotation = false;
        break;
      case Action::SoftDrop:
        ++moved.y;
        ++dropScore;
        break;
      case Action::RotateClockwise: {
        const auto rotated =
            tryRotate(board, active, RotationDirection::Clockwise);
        if (!rotated) return {active, lastMoveWasRotation, dropScore, false};
        active = *rotated;
        lastMoveWasRotation = true;
        continue;
      }
      case Action::RotateCounterClockwise: {
        const auto rotated =
            tryRotate(board, active, RotationDirection::CounterClockwise);
        if (!rotated) return {active, lastMoveWasRotation, dropScore, false};
        active = *rotated;
        lastMoveWasRotation = true;
        continue;
      }
      case Action::Rotate180: {
        const auto rotated =
            tryRotate(board, active, RotationDirection::Rotate180);
        if (!rotated) return {active, lastMoveWasRotation, dropScore, false};
        active = *rotated;
        lastMoveWasRotation = true;
        continue;
      }
      case Action::HardDrop:
        while (true) {
          ActivePiece below = active;
          ++below.y;
          if (!isValidPosition(board, below)) break;
          active = below;
          dropScore += 2;
        }
        locked = true;
        continue;
    }
    if (!isValidPosition(board, moved)) {
      return {active, lastMoveWasRotation, dropScore, false};
    }
    active = moved;
  }

  return {active, lastMoveWasRotation, dropScore,
          locked && active == decision.placement};
}

ClearKind classifyClear(int lines, std::optional<TSpin> tSpin,
                        bool perfectClear) {
  if (perfectClear) return ClearKind::PerfectClear;
  if (tSpin == TSpin::Full) {
    if (lines == 1) return ClearKind::TSpinSingle;
    if (lines == 2) return ClearKind::TSpinDouble;
    if (lines == 3) return ClearKind::TSpinTriple;
  }
  if (tSpin == TSpin::Mini) return ClearKind::TSpinMini;
  if (lines == 1) return ClearKind::Single;
  if (lines == 2) return ClearKind::Double;
  if (lines == 3) return ClearKind::Triple;
  if (lines == 4) return ClearKind::Tetris;
  return ClearKind::None;
}

int baseScore(ClearKind kind) noexcept {
  switch (kind) {
    case ClearKind::Single:
      return 100;
    case ClearKind::Double:
      return 300;
    case ClearKind::Triple:
      return 500;
    case ClearKind::Tetris:
      return 800;
    case ClearKind::TSpinMini:
      return 100;
    case ClearKind::TSpinSingle:
      return 200;
    case ClearKind::TSpinDouble:
      return 400;
    case ClearKind::TSpinTriple:
      return 600;
    case ClearKind::PerfectClear:
      return 3500;
    case ClearKind::None:
      return 0;
  }
  return 0;
}

bool isBackToBackClear(ClearKind kind) noexcept {
  return kind == ClearKind::Tetris || kind == ClearKind::TSpinSingle ||
         kind == ClearKind::TSpinDouble || kind == ClearKind::TSpinTriple;
}

void countClear(GameResult& result, ClearKind kind) {
  switch (kind) {
    case ClearKind::Single:
      ++result.singles;
      break;
    case ClearKind::Double:
      ++result.doubles;
      break;
    case ClearKind::Triple:
      ++result.triples;
      break;
    case ClearKind::Tetris:
      ++result.tetrises;
      break;
    case ClearKind::TSpinMini:
    case ClearKind::TSpinSingle:
    case ClearKind::TSpinDouble:
    case ClearKind::TSpinTriple:
      ++result.tSpins;
      break;
    case ClearKind::PerfectClear:
      ++result.perfectClears;
      break;
    case ClearKind::None:
      break;
  }
}

}  // namespace

double GameResult::averageDecisionMs() const noexcept {
  return piecesPlaced == 0 ? 0.0
                           : totalDecisionMs / static_cast<double>(piecesPlaced);
}

GameResult simulateGame(Agent& agent, std::uint32_t seed,
                        std::size_t maxPieces,
                        const FrameCallback& onFrame) {
  GameResult result;
  result.seed = seed;
  Board board;
  BagGenerator bag(seed);
  PieceType activeType = bag.next();
  int combo = -1;
  bool backToBack = false;
  const auto gameStartedAt = std::chrono::steady_clock::now();

  while (result.piecesPlaced < maxPieces) {
    const ActivePiece spawn{activeType, 3, 0, 0};
    if (!isValidPosition(board, spawn)) {
      result.gameOver = true;
      break;
    }

    const auto decisionStartedAt = std::chrono::steady_clock::now();
    const auto decision = agent.decide(board, activeType);
    const double decisionMs = std::chrono::duration<double, std::milli>(
                                  std::chrono::steady_clock::now() -
                                  decisionStartedAt)
                                  .count();
    result.totalDecisionMs += decisionMs;
    result.maxDecisionMs = std::max(result.maxDecisionMs, decisionMs);
    if (!decision) {
      result.gameOver = true;
      result.invalidDecision = true;
      break;
    }

    const ReplayResult replay = replayDecision(board, activeType, *decision);
    if (!replay.valid) {
      result.gameOver = true;
      result.invalidDecision = true;
      break;
    }

    result.score += replay.dropScore;
    const auto tSpin =
        detectTSpin(board, replay.placement, replay.lastMoveWasRotation);
    const ClearResult cleared = clearLines(lockMino(board, replay.placement));
    board = cleared.board;
    ++result.piecesPlaced;

    if (cleared.linesCleared > 0) {
      ++combo;
      result.linesCleared += cleared.linesCleared;
      const int level = result.linesCleared / 10 + 1;
      const ClearKind kind =
          classifyClear(cleared.linesCleared, tSpin, board.empty());
      const int comboBonus = combo > 0 ? 50 * combo * level : 0;
      result.score += static_cast<std::int64_t>(baseScore(kind)) * level +
                      comboBonus;
      countClear(result, kind);
      backToBack = isBackToBackClear(kind);
    } else {
      combo = -1;
    }

    // B2B does not change score in the current TypeScript backend. Keep the
    // state here so future garbage/versus benchmarks can reuse the simulator.
    (void)backToBack;
    if (onFrame) {
      onFrame(board, result, activeType, cleared.linesCleared);
    }
    activeType = bag.next();
  }

  result.reachedPieceLimit = !result.gameOver && result.piecesPlaced >= maxPieces;
  result.elapsedMs = std::chrono::duration<double, std::milli>(
                         std::chrono::steady_clock::now() - gameStartedAt)
                         .count();
  return result;
}

}  // namespace tetris
