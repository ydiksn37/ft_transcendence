#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <exception>
#include <iostream>
#include <stdexcept>
#include <string>

#include "tetris/agent.hpp"
#include "tetris/bag.hpp"
#include "tetris/easy_agent.hpp"
#include "tetris/expert_agent.hpp"
#include "tetris/game_simulator.hpp"
#include "tetris/hard_agent.hpp"

namespace {

void expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

tetris::Board makeTetrisWell() {
  tetris::Board board;
  for (int row = 16; row < tetris::kBoardRows; ++row) {
    for (int col = 0; col < 9; ++col) {
      board.set(row, col, tetris::Cell::Garbage);
    }
  }
  return board;
}

class HoldFirstAgent final : public tetris::Agent {
 public:
  std::string_view name() const noexcept override { return "hold-test"; }

  std::optional<tetris::AgentDecision> decide(
      const tetris::Board& board, tetris::PieceType,
      const std::vector<tetris::PieceType>& nextPieces,
      std::optional<tetris::PieceType> holdPiece, bool canHold, int, int,
      int, bool) override {
    if (!canHold || (!holdPiece && nextPieces.empty())) return std::nullopt;
    const tetris::PieceType placedType =
        holdPiece ? *holdPiece : nextPieces.front();
    tetris::ActivePiece placement{placedType, 3, 0, 0};
    placement.y = tetris::calcGhostY(board, placement);
    return tetris::AgentDecision{
        placement,
        {tetris::Action::Hold, tetris::Action::HardDrop},
        0.0,
        0,
    };
  }
};

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

void testHardAgentChoosesTetris() {
  const tetris::Board board = makeTetrisWell();
  tetris::HardAgent agent(std::chrono::milliseconds(100));
  const auto decision = agent.decide(board, tetris::PieceType::I);
  expect(decision.has_value(), "hard agent must find a Tetris placement");
  expect(decision->linesCleared == 4,
         "hard agent must prefer an immediately available Tetris");
  expect(decision->completedDepth == 1 && decision->nodesVisited > 0,
         "hard agent must report search statistics");
}

void testHardAgentUsesExistingHoldForTetris() {
  const tetris::Board board = makeTetrisWell();
  tetris::HardAgent agent(std::chrono::milliseconds(100));
  const auto decision = agent.decide(
      board, tetris::PieceType::O, {}, tetris::PieceType::I, true);
  expect(decision.has_value(), "hard agent must consider the held I piece");
  expect(!decision->actions.empty() &&
             decision->actions.front() == tetris::Action::Hold,
         "hard agent must use Hold for an available Tetris");
  expect(decision->placement.type == tetris::PieceType::I &&
             decision->linesCleared == 4,
         "held I piece must complete the Tetris");
}

void testHardAgentUsesEmptyHoldAndConsumesNext() {
  const tetris::Board board = makeTetrisWell();
  tetris::HardAgent agent(std::chrono::milliseconds(100));
  const std::vector<tetris::PieceType> next{tetris::PieceType::I};
  const auto decision = agent.decide(board, tetris::PieceType::O, next,
                                     std::nullopt, true);
  expect(decision.has_value(), "hard agent must consider an empty Hold");
  expect(!decision->actions.empty() &&
             decision->actions.front() == tetris::Action::Hold,
         "hard agent must Hold the current piece to use Next");
  expect(decision->placement.type == tetris::PieceType::I &&
             decision->linesCleared == 4,
         "first Next piece must become active after an empty Hold");
}

void testSimulatorAppliesHoldAndConsumesNext() {
  HoldFirstAgent agent;
  const auto result = tetris::simulateGame(agent, 42, 1);
  expect(result.piecesPlaced == 1 && result.reachedPieceLimit,
         "simulator must lock the piece obtained through Hold");
  expect(result.holdsUsed == 1,
         "simulator must count the empty-Hold operation");
  expect(!result.invalidDecision,
         "Hold followed by hard drop must replay as a legal decision");
}

void testHardAgentChoosesTSpin() {
  tetris::Board board;
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col < 3 || col > 5) board.set(19, col, tetris::Cell::Garbage);
  }
  board.set(18, 3, tetris::Cell::Garbage);
  tetris::HardAgent agent(std::chrono::milliseconds(100));
  const auto decision = agent.decide(board, tetris::PieceType::T);
  expect(decision.has_value(), "hard agent must find a T-Spin placement");
  expect(decision->linesCleared == 1,
         "hard agent must complete the available T-Spin Single");
  const bool rotates = std::any_of(
      decision->actions.begin(), decision->actions.end(),
      [](tetris::Action action) {
        return action == tetris::Action::RotateClockwise ||
               action == tetris::Action::RotateCounterClockwise ||
               action == tetris::Action::Rotate180;
      });
  expect(rotates, "T-Spin decision must contain a rotation");
}

void testHardAgentSimulatorDecisionsAreLegal() {
  tetris::HardAgent agent(std::chrono::milliseconds(5));
  const auto result = tetris::simulateGame(agent, 42, 5);
  expect(result.piecesPlaced == 5 && result.reachedPieceLimit,
         "hard agent must reach the short simulation limit");
  expect(!result.invalidDecision,
         "hard agent must return replayable operation sequences");
  expect(result.searchNodes > 0 && result.maxSearchDepth >= 1,
         "hard simulation must collect search statistics");
  expect(result.tSpins == result.tSpinMinis + result.tSpinSingles +
                              result.tSpinDoubles + result.tSpinTriples,
         "T-Spin total must equal the Mini/Single/Double/Triple breakdown");
  expect(result.backToBackContinuations <= result.backToBackClears,
         "B2B continuations cannot exceed B2B clears");
  expect(result.maxBackToBack <=
             static_cast<int>(result.backToBackClears),
         "maximum B2B chain cannot exceed B2B clears");
}

void testExpertAgentChoosesTetris() {
  const tetris::Board board = makeTetrisWell();
  tetris::ExpertAgent agent(std::chrono::milliseconds(100));
  const auto decision = agent.decide(board, tetris::PieceType::I);
  expect(decision.has_value(), "expert agent must find a Tetris placement");
  expect(decision->linesCleared == 4,
         "expert agent must take an immediately available Tetris");
  expect(!decision->actions.empty() &&
             decision->actions.back() == tetris::Action::HardDrop,
         "expert decision must end with hard drop");
}

void testExpertAgentChoosesTSpinDouble() {
  tetris::Board board;
  board.set(17, 3, tetris::Cell::Garbage);
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col != 4 && col != 5) board.set(18, col, tetris::Cell::Garbage);
    if (col != 4) board.set(19, col, tetris::Cell::Garbage);
  }

  tetris::ExpertAgent agent(std::chrono::milliseconds(100));
  const auto decision = agent.decide(
      board, tetris::PieceType::T, {}, std::nullopt, false, 3, 0, 0, true);
  expect(decision.has_value(), "expert agent must find the prepared TSD");
  expect(decision->linesCleared == 2,
         "expert agent must prefer the available T-Spin Double");
  const bool rotates = std::any_of(
      decision->actions.begin(), decision->actions.end(),
      [](tetris::Action action) {
        return action == tetris::Action::RotateClockwise ||
               action == tetris::Action::RotateCounterClockwise ||
               action == tetris::Action::Rotate180;
      });
  expect(rotates, "T-Spin Double operation sequence must contain a rotation");
}

void testExpertAgentUsesHold() {
  const tetris::Board board = makeTetrisWell();
  tetris::ExpertAgent agent(std::chrono::milliseconds(100));
  const auto decision = agent.decide(
      board, tetris::PieceType::O, {}, tetris::PieceType::I, true);
  expect(decision.has_value(), "expert agent must search the held piece");
  expect(!decision->actions.empty() &&
             decision->actions.front() == tetris::Action::Hold,
         "expert agent must use Hold for the available Tetris");
  expect(decision->placement.type == tetris::PieceType::I &&
             decision->linesCleared == 4,
         "expert agent must complete the Tetris with held I");
}

void testExpertAgentSimulatorDecisionsAreLegal() {
  tetris::ExpertAgent agent(std::chrono::milliseconds(5));
  const auto result = tetris::simulateGame(agent, 42, 10);
  expect(result.piecesPlaced == 10 && result.reachedPieceLimit,
         "expert agent must reach the short simulation limit");
  expect(!result.invalidDecision,
         "expert agent must return replayable TypeScript-compatible actions");
  expect(result.searchNodes > 0 && result.maxSearchDepth >= 1,
         "expert simulation must collect search statistics");
}

void testExpertAgentIsRegistered() {
  const auto agent = tetris::createAgent("expert", 5);
  expect(agent->name() == "expert", "expert model must be registered");
  const auto& names = tetris::availableAgentNames();
  expect(std::find(names.begin(), names.end(), "expert") != names.end(),
         "expert model must be listed by the benchmark");
}

void testExpertFixedNodeSearchIsDeterministic() {
  tetris::ExpertAgent first(std::chrono::milliseconds(1), {}, 6000);
  tetris::ExpertAgent second(std::chrono::milliseconds(1), {}, 6000);
  const auto firstResult = tetris::simulateGame(first, 4242, 10);
  const auto secondResult = tetris::simulateGame(second, 4242, 10);
  expect(firstResult.linesCleared == secondResult.linesCleared &&
             firstResult.attacksSent == secondResult.attacksSent &&
             firstResult.searchNodes == secondResult.searchNodes,
         "fixed-node Expert evaluation must be reproducible");
  expect(!firstResult.invalidDecision && !secondResult.invalidDecision,
         "fixed-node Expert decisions must remain replayable");
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
  expect(first.attacksSent == second.attacksSent,
         "same benchmark seed must reproduce sent garbage");
  expect(first.piecesPlaced == second.piecesPlaced,
         "same benchmark seed must reproduce placed pieces");
  expect(!first.invalidDecision && !second.invalidDecision,
         "easy agent decisions must replay legally");
}

void testGarbageCalculationMatchesTypeScript() {
  expect(tetris::calculateGarbage(1, std::nullopt, false, false) == 0,
         "Single must send zero garbage");
  expect(tetris::calculateGarbage(2, std::nullopt, false, false) == 1,
         "Double must send one garbage line");
  expect(tetris::calculateGarbage(3, std::nullopt, false, false) == 2,
         "Triple must send two garbage lines");
  expect(tetris::calculateGarbage(4, std::nullopt, false, false) == 4 &&
             tetris::calculateGarbage(4, std::nullopt, false, true) == 5,
         "Tetris must receive the backend B2B bonus");
  expect(tetris::calculateGarbage(1, tetris::TSpin::Full, false, false) == 2 &&
             tetris::calculateGarbage(2, tetris::TSpin::Full, false, true) == 5 &&
             tetris::calculateGarbage(3, tetris::TSpin::Full, false, false) == 6,
         "full T-Spins must use the backend attack table");
  expect(tetris::calculateGarbage(1, tetris::TSpin::Mini, false, true) == 1,
         "T-Spin Mini must not receive a B2B attack bonus");
  expect(tetris::calculateGarbage(4, std::nullopt, true, true) == 10,
         "Perfect Clear must override line and B2B attack values");
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
    testHardAgentChoosesTetris();
    testHardAgentUsesExistingHoldForTetris();
    testHardAgentUsesEmptyHoldAndConsumesNext();
    testSimulatorAppliesHoldAndConsumesNext();
    testHardAgentChoosesTSpin();
    testHardAgentSimulatorDecisionsAreLegal();
    testExpertAgentChoosesTetris();
    testExpertAgentChoosesTSpinDouble();
    testExpertAgentUsesHold();
    testExpertAgentSimulatorDecisionsAreLegal();
    testExpertAgentIsRegistered();
    testExpertFixedNodeSearchIsDeterministic();
    testSeededBagIsDeterministicAndUsesAllPieces();
    testSimulatorIsDeterministic();
    testGarbageCalculationMatchesTypeScript();
  } catch (const std::exception& error) {
    std::cerr << "FAILED: " << error.what() << '\n';
    return 1;
  }
  std::cout << "All AI engine tests passed\n";
  return 0;
}
