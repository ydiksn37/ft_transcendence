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

constexpr int visibleRow(int row) {
  return tetris::kBoardRows - tetris::kVisibleBoardRows + row;
}

void expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

tetris::Board makeTetrisWell() {
  tetris::Board board;
  for (int row = visibleRow(16); row < tetris::kBoardRows; ++row) {
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
      const tetris::DecisionContext& context) override {
    if (!context.canHold || (!context.hold && context.next.empty())) {
      return std::nullopt;
    }
    const tetris::PieceType placedType =
        context.hold ? *context.hold : context.next.front();
    tetris::ActivePiece placement{placedType, 3, 0, 0};
    placement.y = tetris::calcGhostY(context.board, placement);
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
             board, {tetris::PieceType::I, 6, tetris::kSpawnY, 0}),
         "horizontal I must fit at x=6");
  expect(!tetris::isValidPosition(
             board, {tetris::PieceType::I, 7, tetris::kSpawnY, 0}),
         "horizontal I must not fit at x=7");
  expect(tetris::isValidPosition(
             board, {tetris::PieceType::I, 3, tetris::kSpawnY, 0}),
         "spawn cells above the visible board must match the TS engine");
  expect(tetris::calcGhostY(
             board, {tetris::PieceType::O, 3, tetris::kSpawnY, 0}) ==
             visibleRow(18),
         "O ghost position must be on the bottom of an empty board");
}

void testLockAndClearLine() {
  tetris::Board board;
  for (int col = 4; col < tetris::kBoardCols; ++col) {
    board.set(visibleRow(19), col, tetris::Cell::Garbage);
  }
  const tetris::ActivePiece piece{tetris::PieceType::I, 0, visibleRow(18), 0};
  expect(tetris::isValidPosition(board, piece), "I must fill the bottom row");
  const auto result = tetris::clearLines(tetris::lockMino(board, piece));
  expect(result.linesCleared == 1, "one full line must be cleared");
  expect(result.board.empty(), "cleared board must be empty");
}

void testSrsIKick() {
  const tetris::Board board;
  const tetris::ActivePiece vertical{tetris::PieceType::I, -2,
                                     visibleRow(1), 1};
  expect(tetris::isValidPosition(board, vertical),
         "vertical I must be valid next to the left wall");
  const auto rotated = tetris::tryRotate(
      board, vertical, tetris::RotationDirection::Clockwise);
  expect(rotated.has_value(), "I rotation must succeed with an SRS kick");
  expect(rotated->x == 0 && rotated->y == visibleRow(1) &&
             rotated->rotation == 2,
         "I rotation must use the same x/y kick offset as the frontend");
  expect(!tetris::tryRotate(
              board, {tetris::PieceType::O, 3, tetris::kSpawnY, 0},
              tetris::RotationDirection::Clockwise)
              .has_value(),
         "O rotation must be ignored like the frontend");
}

void testTSpinDetection() {
  tetris::Board board;
  board.set(visibleRow(17), 3, tetris::Cell::Garbage);
  board.set(visibleRow(19), 3, tetris::Cell::Garbage);
  board.set(visibleRow(19), 5, tetris::Cell::Garbage);
  const tetris::ActivePiece piece{tetris::PieceType::T, 3, visibleRow(17), 0};
  expect(tetris::detectTSpin(board, piece, true, 0, 1) ==
             tetris::TSpin::Full,
         "two occupied front corners must be a full T-Spin");
  expect(!tetris::detectTSpin(board, piece, false, 0, 1).has_value(),
         "last move must be a rotation for a T-Spin");

  tetris::Board miniBoard;
  miniBoard.set(visibleRow(17), 3, tetris::Cell::Garbage);
  miniBoard.set(visibleRow(17), 5, tetris::Cell::Garbage);
  miniBoard.set(visibleRow(19), 3, tetris::Cell::Garbage);
  expect(tetris::detectTSpin(miniBoard, piece, true, 0, 1) ==
             tetris::TSpin::Mini,
         "three corners with one front corner must be a Mini");
  expect(tetris::detectTSpin(miniBoard, piece, true, 4, 1) ==
             tetris::TSpin::Full,
         "the fifth SRS kick must upgrade a Mini to a full T-Spin");
  expect(tetris::detectTSpin(miniBoard, piece, true, 0, 2) ==
             tetris::TSpin::Full,
         "a two-line T-Spin must be full like the frontend");

  tetris::Board twoCorners;
  twoCorners.set(visibleRow(17), 3, tetris::Cell::Garbage);
  twoCorners.set(visibleRow(19), 5, tetris::Cell::Garbage);
  expect(!tetris::detectTSpin(twoCorners, piece, true, 0, 1).has_value(),
         "two occupied corners must not be classified as a T-Spin");
}

void testGarbageLines() {
  tetris::Board board;
  board.set(visibleRow(2), 0, tetris::Cell::I);
  const tetris::Board result = tetris::addGarbageLines(board, {2, 7});
  expect(result.at(visibleRow(0), 0) == tetris::Cell::I,
         "garbage must push existing cells upward");
  expect(result.at(visibleRow(18), 2) == tetris::Cell::Empty &&
             result.at(visibleRow(18), 1) == tetris::Cell::Garbage,
         "first garbage row must use its specified gap");
  expect(result.at(visibleRow(19), 7) == tetris::Cell::Empty &&
             result.at(visibleRow(19), 8) == tetris::Cell::Garbage,
         "second garbage row must use its specified gap");
}

void testProjectedGarbageIsDeterministic() {
  tetris::DecisionContext context;
  context.active = tetris::PieceType::T;
  context.next = {tetris::PieceType::I, tetris::PieceType::O};
  context.garbageQueue = 4;
  context.garbageGapColumns = {2, 7};

  const std::vector<int> first = tetris::projectedGarbageGaps(context);
  const std::vector<int> second = tetris::projectedGarbageGaps(context);
  expect(first == second, "unknown garbage holes must be deterministic");
  expect(first.size() == 4 && first[0] == 2 && first[1] == 7,
         "known garbage holes must be preserved before projected holes");
  expect(std::all_of(first.begin(), first.end(), [](int gap) {
           return gap >= 0 && gap < tetris::kBoardCols;
         }),
         "every projected garbage hole must be on the board");
}

void testEasyAgentEvaluatesPendingGarbage() {
  tetris::DecisionContext context;
  context.active = tetris::PieceType::O;
  context.garbageQueue = 2;
  context.garbageGapColumns = {2, 7};
  tetris::EasyAgent agent;
  const auto decision = agent.decide(context);
  expect(decision.has_value(),
         "easy agent must decide with pending garbage present");

  const tetris::ClearResult cleared = tetris::clearLines(
      tetris::lockMino(context.board, decision->placement));
  const tetris::Board afterGarbage = tetris::applyPendingGarbage(
      cleared.board, context.garbageGapColumns);
  const double expectedScore = tetris::evaluateBoard(afterGarbage).score;
  expect(std::abs(decision->score - expectedScore) < 1e-9,
         "easy score must evaluate the board after pending garbage rises");
}

void testEveryDifficultyAcceptsDecisionContext() {
  tetris::DecisionContext context;
  context.active = tetris::PieceType::T;
  context.next = {tetris::PieceType::I, tetris::PieceType::O,
                  tetris::PieceType::S};
  context.garbageQueue = 2;
  context.garbageGapColumns = {4, 4};
  context.opponent.available = true;
  context.opponent.garbageQueue = 3;

  tetris::EasyAgent easy;
  tetris::HardAgent hard(std::chrono::milliseconds(20));
  tetris::ExpertAgent expert(std::chrono::milliseconds(20));
  const std::array<tetris::Agent*, 3> agents{&easy, &hard, &expert};
  for (tetris::Agent* agent : agents) {
    const auto decision = agent->decide(context);
    expect(decision.has_value(),
           std::string(agent->name()) +
               " must accept the shared garbage-aware context");
    expect(!decision->actions.empty() &&
               decision->actions.back() == tetris::Action::HardDrop,
           std::string(agent->name()) +
               " must return a replayable hard-drop decision");
  }
}

void testEvaluationMatchesTypeScript() {
  tetris::Board board;
  board.set(visibleRow(18), 0, tetris::Cell::I);
  board.set(visibleRow(19), 1, tetris::Cell::O);
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
    board.set(visibleRow(19), col, tetris::Cell::Garbage);
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
  board.set(tetris::kSpawnY, 3, tetris::Cell::Garbage);
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

void testExpertTSpinDoublePatternFeatures() {
  tetris::Board ready;
  ready.set(visibleRow(17), 3, tetris::Cell::Garbage);
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col < 3 || col > 5)
      ready.set(visibleRow(18), col, tetris::Cell::Garbage);
    if (col != 4) ready.set(visibleRow(19), col, tetris::Cell::Garbage);
  }

  const tetris::ExpertPatternFeatures readyFeatures =
      tetris::extractExpertPatternFeatures(ready);
  expect(readyFeatures.completedTSpinDoublePatterns == 1 &&
             readyFeatures.completedTSpinDoubleLines == 2,
         "completed TSD pattern must be weighted by its two real clears");
  expect(readyFeatures.preTSpinDoublePatterns >= 1,
         "completed TSD must retain its preceding setup feature");

  tetris::Board blocked = ready;
  for (int col = 2; col <= 6; ++col) {
    blocked.set(visibleRow(16), col, tetris::Cell::Garbage);
  }
  expect(tetris::extractExpertPatternFeatures(blocked)
             .completedTSpinDoublePatterns == 0,
         "a visually complete TSD with a sealed entrance must be rejected");

  tetris::Board mirrored;
  mirrored.set(visibleRow(17), 5, tetris::Cell::Garbage);
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col < 3 || col > 5)
      mirrored.set(visibleRow(18), col, tetris::Cell::Garbage);
    if (col != 4) mirrored.set(visibleRow(19), col, tetris::Cell::Garbage);
  }
  expect(tetris::extractExpertPatternFeatures(mirrored)
             .completedTSpinDoubleLines == 2,
         "completed TSD pattern must be detected after mirroring");

  tetris::Board fakeReady;
  fakeReady.set(visibleRow(17), 3, tetris::Cell::Garbage);
  fakeReady.set(visibleRow(19), 3, tetris::Cell::Garbage);
  fakeReady.set(visibleRow(19), 5, tetris::Cell::Garbage);
  const tetris::ExpertPatternFeatures fakeFeatures =
      tetris::extractExpertPatternFeatures(fakeReady);
  expect(fakeFeatures.preTSpinDoublePatterns >= 1 &&
             fakeFeatures.completedTSpinDoubleLines == 0,
         "an unfilled TSD shape must not receive completed-pattern reward");
}

void testExpertSevenBagTAvailability() {
  const std::vector<tetris::PieceType> next{
      tetris::PieceType::I, tetris::PieceType::O, tetris::PieceType::T,
      tetris::PieceType::S};

  const tetris::ExpertTAvailability held =
      tetris::determineExpertTAvailability(tetris::PieceType::T, next);
  expect(held.inHold && held.exact && held.movesUntilT == 0,
         "held T must be immediately available");

  const tetris::ExpertTAvailability visible =
      tetris::determineExpertTAvailability(std::nullopt, next);
  expect(!visible.inHold && visible.exact && visible.movesUntilT == 3,
         "visible T distance must be measured from the current Next head");

  const tetris::ExpertTAvailability afterTwo =
      tetris::determineExpertTAvailability(std::nullopt, next, 2);
  expect(afterTwo.exact && afterTwo.movesUntilT == 1,
         "beam-state Next index must shift the visible T distance");

  const std::vector<tetris::PieceType> withoutT{
      tetris::PieceType::I, tetris::PieceType::O, tetris::PieceType::S,
      tetris::PieceType::Z, tetris::PieceType::J};
  const tetris::ExpertTAvailability hidden =
      tetris::determineExpertTAvailability(std::nullopt, withoutT);
  expect(!hidden.exact && !hidden.inHold && hidden.movesUntilT == 13,
         "hidden T must use the conservative maximum 7-bag interval");
}

void testExpertRejectsBuriedTSpinSetups() {
  tetris::Board board;
  for (const int visible : {3, 9, 15}) {
    const int row = visibleRow(visible);
    board.set(row, 3, tetris::Cell::Garbage);
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col < 3 || col > 5) {
        board.set(row + 1, col, tetris::Cell::Garbage);
      }
      if (col != 4) board.set(row + 2, col, tetris::Cell::Garbage);
    }
  }
  const tetris::ExpertPatternFeatures features =
      tetris::extractExpertPatternFeatures(board);
  expect(features.completedTSpinDoublePatterns == 1 &&
             features.completedTSpinDoubleLines == 2,
         "only the TSD slot reachable from spawn must receive completion "
         "reward");
}

void testExpertExecutesReachableTSpinDouble() {
  tetris::Board board;
  board.set(visibleRow(17), 3, tetris::Cell::Garbage);
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col < 3 || col > 5)
      board.set(visibleRow(18), col, tetris::Cell::Garbage);
    if (col != 4) board.set(visibleRow(19), col, tetris::Cell::Garbage);
  }

  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 10000);
  const auto decision = agent.decide(
      board, tetris::PieceType::T, {}, std::nullopt, false);
  expect(decision.has_value() && decision->linesCleared == 2,
         "expert must execute a reachable completed TSD");
  expect(decision->placement.rotation == 2,
         "reachable TSD fixture must finish with the expected rotation");
}

void testExpertPreservesReachableTSpinDouble() {
  tetris::Board board;
  board.set(visibleRow(17), 3, tetris::Cell::Garbage);
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col < 3 || col > 5)
      board.set(visibleRow(18), col, tetris::Cell::Garbage);
    if (col != 4) board.set(visibleRow(19), col, tetris::Cell::Garbage);
  }

  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::O,
      {tetris::PieceType::I, tetris::PieceType::J,
       tetris::PieceType::L, tetris::PieceType::T},
      tetris::PieceType::S, false);
  expect(decision.has_value(),
         "expert must decide while waiting for the next T piece");
  const tetris::ClearResult after = tetris::clearLines(
      tetris::lockMino(board, decision->placement));
  expect(tetris::extractExpertPatternFeatures(after.board)
             .completedTSpinDoublePatterns == 1,
         "expert must not bury a reachable TSD before T arrives");
}

void testExpertWellDistanceFeature() {
  tetris::Board board;
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col != 3)
      board.set(visibleRow(19), col, tetris::Cell::Garbage);
  }
  const tetris::ExpertPatternFeatures features =
      tetris::extractExpertPatternFeatures(board);
  expect(features.wellDistance[3] == 1 &&
             std::count(features.wellDistance.begin(),
                        features.wellDistance.end(), 1) == 1,
         "a column-three well must activate the distance-three one-hot");
}

void testExpertBoardStabilityPenalizesBuriedHoles() {
  tetris::Board clean;
  clean.set(visibleRow(19), 0, tetris::Cell::Garbage);
  clean.set(visibleRow(19), 1, tetris::Cell::Garbage);

  tetris::Board oneHole;
  oneHole.set(visibleRow(18), 0, tetris::Cell::Garbage);
  oneHole.set(visibleRow(19), 1, tetris::Cell::Garbage);

  tetris::Board twoHoles;
  twoHoles.set(visibleRow(17), 0, tetris::Cell::Garbage);
  twoHoles.set(visibleRow(19), 1, tetris::Cell::Garbage);

  const double cleanValue = tetris::evaluateExpertBoard(clean).value;
  const double oneHoleValue = tetris::evaluateExpertBoard(oneHole).value;
  const double twoHoleValue = tetris::evaluateExpertBoard(twoHoles).value;
  expect(cleanValue > oneHoleValue && oneHoleValue > twoHoleValue,
         "Expert stability must increasingly penalize buried holes");
}

void testExpertAvoidsWastingTWithHold() {
  tetris::ExpertWeights weights;
  weights.tWastedPenalty = 1.0e9;
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), weights);
  const std::vector<tetris::PieceType> next{tetris::PieceType::O};
  const auto decision = agent.decide(
      tetris::Board{}, tetris::PieceType::T, next, std::nullopt, true);
  expect(decision.has_value(), "expert agent must decide on an empty board");
  expect(!decision->actions.empty() &&
             decision->actions.front() == tetris::Action::Hold &&
             decision->placement.type == tetris::PieceType::O,
         "T-wasted penalty must preserve T through an available empty Hold");
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
    testProjectedGarbageIsDeterministic();
    testEasyAgentEvaluatesPendingGarbage();
    testEveryDifficultyAcceptsDecisionContext();
    testEvaluationMatchesTypeScript();
    testEasyAgentClearsAvailableLine();
    testEasyAgentReportsBlockedSpawn();
    testHardAgentChoosesTetris();
    testHardAgentUsesExistingHoldForTetris();
    testHardAgentUsesEmptyHoldAndConsumesNext();
    testSimulatorAppliesHoldAndConsumesNext();
    testHardAgentSimulatorDecisionsAreLegal();
    testExpertAgentChoosesTetris();
    testExpertTSpinDoublePatternFeatures();
    testExpertSevenBagTAvailability();
    testExpertRejectsBuriedTSpinSetups();
    testExpertExecutesReachableTSpinDouble();
    testExpertPreservesReachableTSpinDouble();
    testExpertWellDistanceFeature();
    testExpertBoardStabilityPenalizesBuriedHoles();
    testExpertAvoidsWastingTWithHold();
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
