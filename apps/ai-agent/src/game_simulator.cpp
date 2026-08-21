#include "tetris/game_simulator.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <optional>
#include <vector>

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
                            const AgentDecision& decision,
                            std::size_t firstAction) {
  ActivePiece active{type, 3, 0, 0};
  bool lastMoveWasRotation = false;
  int dropScore = 0;
  bool locked = false;

  for (std::size_t index = firstAction; index < decision.actions.size();
       ++index) {
    const Action action = decision.actions[index];
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
      case Action::Hold:
        return {active, lastMoveWasRotation, dropScore, false};
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
      ++result.tSpins;
      ++result.tSpinMinis;
      break;
    case ClearKind::TSpinSingle:
      ++result.tSpins;
      ++result.tSpinSingles;
      break;
    case ClearKind::TSpinDouble:
      ++result.tSpins;
      ++result.tSpinDoubles;
      break;
    case ClearKind::TSpinTriple:
      ++result.tSpins;
      ++result.tSpinTriples;
      break;
    case ClearKind::PerfectClear:
      ++result.perfectClears;
      break;
    case ClearKind::None:
      break;
  }
}

}  // namespace

int calculateGarbage(int linesCleared, std::optional<TSpin> tSpin,
                     bool perfectClear,
                     bool backToBackActive) noexcept {
  if (perfectClear) return 10;

  int garbage = 0;
  bool backToBackEligible = false;
  if (tSpin == TSpin::Full) {
    if (linesCleared == 1) garbage = 2;
    if (linesCleared == 2) garbage = 4;
    if (linesCleared == 3) garbage = 6;
    backToBackEligible = linesCleared >= 1 && linesCleared <= 3;
  } else if (tSpin == TSpin::Mini) {
    garbage = 1;
  } else {
    if (linesCleared == 2) garbage = 1;
    if (linesCleared == 3) garbage = 2;
    if (linesCleared == 4) garbage = 4;
    backToBackEligible = linesCleared == 4;
  }

  if (backToBackActive && backToBackEligible) ++garbage;
  return garbage;
}

double GameResult::averageDecisionMs() const noexcept {
  return piecesPlaced == 0 ? 0.0
                           : totalDecisionMs / static_cast<double>(piecesPlaced);
}

double GameResult::averageSearchDepth() const noexcept {
  return piecesPlaced == 0
             ? 0.0
             : static_cast<double>(totalSearchDepth) /
                   static_cast<double>(piecesPlaced);
}

GameResult simulateGame(Agent& agent, std::uint32_t seed,
                        std::size_t maxPieces,
                        const FrameCallback& onFrame) {
  GameResult result;
  result.seed = seed;
  Board board;
  BagGenerator bag(seed);
  PieceType activeType = bag.next();
  std::optional<PieceType> holdPiece;
  int combo = -1;
  int backToBackChain = 0;
  const auto gameStartedAt = std::chrono::steady_clock::now();

  while (result.piecesPlaced < maxPieces) {
    const ActivePiece spawn{activeType, 3, 0, 0};
    if (!isValidPosition(board, spawn)) {
      result.gameOver = true;
      break;
    }

    std::vector<PieceType> nextPieces;
    nextPieces.reserve(8);
    BagGenerator previewBag = bag;
    for (int index = 0; index < 8; ++index) {
      nextPieces.push_back(previewBag.next());
    }

    const auto decisionStartedAt = std::chrono::steady_clock::now();
    const auto decision = agent.decide(board, activeType, nextPieces,
                                       holdPiece, true, 3, 0, 0,
                                       backToBackChain > 0);
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
    result.searchNodes += decision->nodesVisited;
    result.totalSearchDepth +=
        static_cast<std::uint64_t>(decision->completedDepth);
    result.maxSearchDepth =
        std::max(result.maxSearchDepth, decision->completedDepth);
    if (decision->timedOut) ++result.timedOutDecisions;

    PieceType placedType = activeType;
    std::size_t firstAction = 0;
    if (!decision->actions.empty() &&
        decision->actions.front() == Action::Hold) {
      ++result.holdsUsed;
      firstAction = 1;
      if (holdPiece) {
        std::swap(placedType, *holdPiece);
      } else {
        holdPiece = activeType;
        placedType = bag.next();
      }
    }
    if (firstAction < decision->actions.size() &&
        decision->actions[firstAction] == Action::Hold) {
      result.gameOver = true;
      result.invalidDecision = true;
      break;
    }

    const ReplayResult replay =
        replayDecision(board, placedType, *decision, firstAction);
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
      result.attacksSent += calculateGarbage(
          cleared.linesCleared, tSpin, board.empty(), backToBackChain > 0);
      const int comboBonus = combo > 0 ? 50 * combo * level : 0;
      result.score += static_cast<std::int64_t>(baseScore(kind)) * level +
                      comboBonus;
      countClear(result, kind);
      // Match game-instance.ts: a Tetris or any line-clearing T-Spin keeps
      // B2B; an ordinary line clear breaks it. A zero-line move preserves it.
      const bool backToBackClear =
          kind == ClearKind::Tetris || tSpin.has_value();
      if (backToBackClear) {
        ++result.backToBackClears;
        if (backToBackChain > 0) ++result.backToBackContinuations;
        ++backToBackChain;
        result.maxBackToBack =
            std::max(result.maxBackToBack, backToBackChain);
      } else {
        if (backToBackChain > 0) ++result.backToBackBreaks;
        backToBackChain = 0;
      }
    } else {
      combo = -1;
    }
    result.currentBackToBack = backToBackChain;
    if (onFrame) {
      onFrame(board, result, placedType, cleared.linesCleared, holdPiece);
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
