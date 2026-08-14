#include <array>
#include <cmath>
#include <exception>
#include <iostream>
#include <stdexcept>
#include <string>

#include "tetris/agent.hpp"
#include "tetris/bag.hpp"
#include "tetris/easy_agent.hpp"
#include "tetris/game_simulator.hpp"

namespace {

void expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

void testEmptyBoardAndShapes() {
  const tetris::Board board;
  expect(board.empty(), "new board must be empty");
  expect(tetris::isValidPosition(
             board, {tetris::PieceType::I, 6, 0, 0}),
         "horizontal I must fit at x=6");
  expect(!tetris::isValidPosition(
             board, {tetris::PieceType::I, 7, 0, 0}),
         "horizontal I must not fit at x=7");
  expect(tetris::calcGhostY(
             board, {tetris::PieceType::O, 3, 0, 0}) == 18,
         "O ghost position must be y=18 on an empty board");
}

void testLockAndClearLine() {
  tetris::Board board;
  for (int col = 4; col < tetris::kBoardCols; ++col) {
    board.set(19, col, tetris::Cell::Garbage);
  }
  const tetris::ActivePiece piece{tetris::PieceType::I, 0, 19, 0};
  expect(tetris::isValidPosition(board, piece), "I must fill the bottom row");
  const auto result = tetris::clearLines(tetris::lockMino(board, piece));
  expect(result.linesCleared == 1, "one full line must be cleared");
  expect(result.board.empty(), "cleared board must be empty");
}

void testSrsIKick() {
  const tetris::Board board;
  const tetris::ActivePiece vertical{tetris::PieceType::I, -2, 1, 1};
  expect(tetris::isValidPosition(board, vertical),
         "vertical I must be valid next to the left wall");
  const auto rotated = tetris::tryRotate(
      board, vertical, tetris::RotationDirection::Clockwise);
  expect(rotated.has_value(), "I rotation must succeed with an SRS kick");
  expect(rotated->x == 0 && rotated->y == 0 && rotated->rotation == 2,
         "I rotation must use the same kick offset as TypeScript");
}

void testTSpinDetection() {
  tetris::Board board;
  board.set(17, 3, tetris::Cell::Garbage);
  board.set(17, 5, tetris::Cell::Garbage);
  board.set(19, 3, tetris::Cell::Garbage);
  const tetris::ActivePiece piece{tetris::PieceType::T, 3, 17, 0};
  expect(tetris::detectTSpin(board, piece, true) == tetris::TSpin::Full,
         "three occupied corners must be a full T-Spin");
  expect(!tetris::detectTSpin(board, piece, false).has_value(),
         "last move must be a rotation for a T-Spin");
}

void testGarbageLines() {
  tetris::Board board;
  board.set(2, 0, tetris::Cell::I);
  const tetris::Board result = tetris::addGarbageLines(board, {2, 7});
  expect(result.at(0, 0) == tetris::Cell::I,
         "garbage must push existing cells upward");
  expect(result.at(18, 2) == tetris::Cell::Empty &&
             result.at(18, 1) == tetris::Cell::Garbage,
         "first garbage row must use its specified gap");
  expect(result.at(19, 7) == tetris::Cell::Empty &&
             result.at(19, 8) == tetris::Cell::Garbage,
         "second garbage row must use its specified gap");
}

void testEvaluationMatchesTypeScript() {
  tetris::Board board;
  board.set(18, 0, tetris::Cell::I);
  board.set(19, 1, tetris::Cell::O);
  const auto evaluation = tetris::evaluateBoard(board);
  expect(evaluation.aggregateHeight == 3, "aggregate height must be 3");
  expect(evaluation.holes == 1, "covered empty cell must count as a hole");
  expect(evaluation.bumpiness == 2, "bumpiness must be 2");
  expect(std::abs(evaluation.score - 2.25) < 1e-9,
         "evaluation weights must match TypeScript");
}

void testEasyAgentClearsAvailableLine() {
  tetris::Board board;
  for (int col = 4; col < tetris::kBoardCols; ++col) {
    board.set(19, col, tetris::Cell::Garbage);
  }
  const auto decision = tetris::decideEasy(board, tetris::PieceType::I);
  expect(decision.has_value(), "easy agent must find a legal placement");
  expect(decision->linesCleared == 1, "easy agent must clear the available line");
  expect(decision->placement.x == 0 && decision->placement.rotation == 0,
         "easy agent must place the horizontal I in columns 0-3");
  expect(!decision->actions.empty() &&
             decision->actions.back() == tetris::Action::HardDrop,
         "decision must finish with hard drop");
}

void testEasyAgentReportsBlockedSpawn() {
  tetris::Board board;
  board.set(0, 3, tetris::Cell::Garbage);
  expect(!tetris::decideEasy(board, tetris::PieceType::O).has_value(),
         "blocked spawn must produce no decision");
}

void testSeededBagIsDeterministicAndUsesAllPieces() {
  tetris::BagGenerator first(42);
  tetris::BagGenerator second(42);
  for (int bagIndex = 0; bagIndex < 2; ++bagIndex) {
    std::array<int, 7> counts{};
    for (int index = 0; index < 7; ++index) {
      const auto firstPiece = first.next();
      const auto secondPiece = second.next();
      expect(firstPiece == secondPiece, "same seed must produce the same bag");
      ++counts[static_cast<std::size_t>(firstPiece)];
    }
    for (const int count : counts) {
      expect(count == 1, "each 7-bag must contain every piece exactly once");
    }
  }
}

void testSimulatorIsDeterministic() {
  tetris::EasyAgent firstAgent;
  tetris::EasyAgent secondAgent;
  const auto first = tetris::simulateGame(firstAgent, 1234, 25);
  const auto second = tetris::simulateGame(secondAgent, 1234, 25);
  expect(first.piecesPlaced == 25 && first.reachedPieceLimit,
         "easy agent must reach the test piece limit");
  expect(first.linesCleared == second.linesCleared,
         "same benchmark seed must reproduce cleared lines");
  expect(first.score == second.score,
         "same benchmark seed must reproduce score");
  expect(first.piecesPlaced == second.piecesPlaced,
         "same benchmark seed must reproduce placed pieces");
  expect(!first.invalidDecision && !second.invalidDecision,
         "easy agent decisions must replay legally");
}

}  // namespace

int main() {
  try {
    testEmptyBoardAndShapes();
    testLockAndClearLine();
    testSrsIKick();
    testTSpinDetection();
    testGarbageLines();
    testEvaluationMatchesTypeScript();
    testEasyAgentClearsAvailableLine();
    testEasyAgentReportsBlockedSpawn();
    testSeededBagIsDeterministicAndUsesAllPieces();
    testSimulatorIsDeterministic();
  } catch (const std::exception& error) {
    std::cerr << "FAILED: " << error.what() << '\n';
    return 1;
  }
  std::cout << "All AI engine tests passed\n";
  return 0;
}
