#include <cstdlib>
#include <iostream>
#include <set>
#include <string>

#include "tetris/bag.hpp"
#include "tetris/board.hpp"
#include "tetris_cli/game.hpp"

namespace {

int failures = 0;

void expect(bool condition, const std::string& message) {
  if (condition) return;
  ++failures;
  std::cerr << "FAIL: " << message << '\n';
}

void testSevenBag() {
  tetris::BagGenerator bag(42);
  for (int bagIndex = 0; bagIndex < 4; ++bagIndex) {
    std::set<tetris::PieceType> pieces;
    for (int index = 0; index < 7; ++index) pieces.insert(bag.next());
    expect(pieces.size() == 7, "each bag contains every tetromino exactly once");
  }
}

void testTypeScript180Kick() {
  tetris::Board board;
  const tetris::ActivePiece piece{tetris::PieceType::T, 3, 20, 0};
  board.set(22, 4, tetris::Cell::Garbage);
  expect(tetris::isValidPosition(board, piece), "180 test starts valid");

  int kickIndex = -1;
  const auto rotated = tetris::tryRotate(
      board, piece, tetris::RotationDirection::Rotate180, &kickIndex);
  expect(rotated.has_value(), "180 rotation uses the TS kick table");
  expect(rotated && rotated->rotation == 2 && rotated->y == 19,
         "180 rotation applies [0,-1] when the no-kick position is blocked");
  expect(kickIndex == 1, "180 rotation reports the matching kick index");
}

void testHoldAndNext() {
  const auto now = tetris_cli::Game::TimePoint{};
  tetris_cli::Game game(tetris_cli::GameMode::Marathon, 1234, now);
  const auto first = game.activePiece().type;
  expect(game.nextPieces().size() == 5, "five NEXT pieces are always available");

  game.dispatch(tetris_cli::GameAction::Hold, now);
  expect(game.holdPiece() == first, "HOLD stores the current piece");
  expect(!game.holdAvailable(), "HOLD locks until the piece is placed");
  const auto afterFirstHold = game.activePiece().type;
  game.dispatch(tetris_cli::GameAction::Hold, now);
  expect(game.activePiece().type == afterFirstHold,
         "a second HOLD before lock is ignored");

  game.dispatch(tetris_cli::GameAction::HardDrop, now);
  expect(game.pieces() == 1, "hard drop locks exactly one piece");
  expect(game.holdAvailable(), "HOLD unlocks after placement");
}

void testScoring() {
  using tetris_cli::LockScoreInput;
  const auto tsd = tetris_cli::calculateLockScore(
      LockScoreInput{2, tetris::TSpin::Full, false, false, 0, 1});
  expect(tsd.points == 1200 && tsd.label == "T-SPIN DOUBLE",
         "T-Spin Double follows frontend scoring");

  const auto b2bCombo = tetris_cli::calculateLockScore(
      LockScoreInput{4, std::nullopt, true, false, 2, 3});
  expect(b2bCombo.points == 3900,
         "B2B and REN bonuses follow frontend scoring");
  expect(tetris_cli::gravityInterval(1).count() == 1000,
         "level 1 gravity matches frontend");
}

void testPauseExcludesElapsedTime() {
  using namespace std::chrono_literals;
  const auto start = tetris_cli::Game::TimePoint{};
  tetris_cli::Game game(tetris_cli::GameMode::FortyLines, 7, start);
  game.dispatch(tetris_cli::GameAction::Pause, start + 1s);
  expect(game.status() == tetris_cli::GameStatus::Paused,
         "pause stops the game");
  expect(game.elapsed(start + 4s) == 1s, "paused time is excluded");
  game.dispatch(tetris_cli::GameAction::Pause, start + 4s);
  expect(game.elapsed(start + 5s) == 2s,
         "elapsed time resumes after unpausing");
}

}  // namespace

int main() {
  testSevenBag();
  testTypeScript180Kick();
  testHoldAndNext();
  testScoring();
  testPauseExcludesElapsedTime();
  if (failures != 0) {
    std::cerr << failures << " test(s) failed\n";
    return EXIT_FAILURE;
  }
  std::cout << "all CLI engine tests passed\n";
  return EXIT_SUCCESS;
}
