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

tetris::Board makeSolidColumns(
    const std::array<int, tetris::kBoardCols>& heights) {
  tetris::Board board;
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    for (int height = 0; height < heights[col]; ++height) {
      board.set(tetris::kBoardRows - 1 - height, col,
                tetris::Cell::Garbage);
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

void testHardAgentIgnoresBackToBackState() {
  tetris::DecisionContext context;
  for (int col = 4; col < tetris::kBoardCols; ++col) {
    context.board.set(visibleRow(19), col, tetris::Cell::Garbage);
  }
  context.active = tetris::PieceType::I;
  context.canHold = false;

  tetris::HardAgent withoutChain(std::chrono::milliseconds(100));
  context.backToBack = 0;
  const auto ordinaryDecision = withoutChain.decide(context);

  tetris::HardAgent withChain(std::chrono::milliseconds(100));
  context.backToBack = 8;
  const auto chainedDecision = withChain.decide(context);

  expect(ordinaryDecision.has_value() && chainedDecision.has_value(),
         "hard agent must decide regardless of B2B state");
  expect(ordinaryDecision->linesCleared == 1 &&
             chainedDecision->linesCleared == 1,
         "hard must take the same useful ordinary clear without preserving B2B");
  expect(ordinaryDecision->placement == chainedDecision->placement &&
             ordinaryDecision->actions == chainedDecision->actions,
         "hard decision must be independent of the current B2B chain");
}

void testHardBoardStronglyRejectsBuriedHoles() {
  tetris::Board clean;
  for (int col = 0; col < 9; ++col) {
    clean.set(visibleRow(19), col, tetris::Cell::Garbage);
  }

  tetris::Board buried;
  for (int col = 0; col < 8; ++col) {
    buried.set(visibleRow(19), col, tetris::Cell::Garbage);
  }
  buried.set(visibleRow(18), 8, tetris::Cell::Garbage);

  const auto cleanEvaluation = tetris::evaluateHardBoard(clean);
  const auto buriedEvaluation = tetris::evaluateHardBoard(buried);
  expect(cleanEvaluation.holes == 0 && buriedEvaluation.holes == 1,
         "Hard diagnostics must distinguish an open lane from a buried hole");
  expect(cleanEvaluation.value > buriedEvaluation.value + 8000.0,
         "one buried cell must cost more than an ordinary Tetris can earn");
}

void testHardBoardAllowsOnlyOneWell() {
  const tetris::Board oneWell = makeSolidColumns(
      {4, 4, 4, 0, 4, 4, 4, 4, 4, 4});
  const tetris::Board twoWells = makeSolidColumns(
      {4, 4, 0, 4, 4, 4, 0, 4, 4, 4});

  const auto oneEvaluation = tetris::evaluateHardBoard(oneWell);
  const auto twoEvaluation = tetris::evaluateHardBoard(twoWells);
  expect(oneEvaluation.primaryWellDepth == 4 &&
             oneEvaluation.extraWellCount == 0,
         "one four-row I lane must be preserved as the primary Well");
  expect(twoEvaluation.primaryWellDepth == 4 &&
             twoEvaluation.extraWellCount >= 1,
         "a second one-column valley must be classified as an extra Well");
  expect(oneEvaluation.value > twoEvaluation.value + 1000.0,
         "Hard must prefer one I lane over multiple deep Wells");
}

void testHardBoardPrefersFlatStacking() {
  const tetris::Board flat =
      makeSolidColumns({2, 2, 2, 2, 2, 2, 2, 2, 2, 2});
  const tetris::Board jagged =
      makeSolidColumns({1, 3, 1, 3, 1, 3, 1, 3, 1, 3});

  const auto flatEvaluation = tetris::evaluateHardBoard(flat);
  const auto jaggedEvaluation = tetris::evaluateHardBoard(jagged);
  expect(flatEvaluation.aggregateHeight == jaggedEvaluation.aggregateHeight,
         "flatness fixture must compare boards with equal aggregate height");
  expect(flatEvaluation.flatSurfaceRoughness == 0 &&
             jaggedEvaluation.flatSurfaceRoughness > 0,
         "Hard diagnostics must measure roughness outside the primary Well");
  expect(flatEvaluation.value > jaggedEvaluation.value,
         "Hard must prefer a flat surface when height and holes are equal");
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

void testHardAgentKeepsSoloStackHoleFree() {
  tetris::HardAgent agent(std::chrono::milliseconds(50));
  int maximumHoles = 0;
  std::size_t firstHolePiece = 0;
  const auto result = tetris::simulateGame(
      agent, 192706392, 100,
      [&](const tetris::Board& board, const tetris::GameResult& frameResult,
          tetris::PieceType, int, std::optional<tetris::PieceType>) {
        const int holes = tetris::evaluateHardBoard(board).holes;
        maximumHoles = std::max(maximumHoles, holes);
        if (holes > 0 && firstHolePiece == 0) {
          firstHolePiece = frameResult.piecesPlaced;
        }
      });
  expect(result.reachedPieceLimit && !result.invalidDecision,
         "Hard must complete the flat-stacking regression simulation");
  expect(maximumHoles == 0,
         "Hard must not create a buried hole during clean solo stacking; "
         "first=" + std::to_string(firstHolePiece) +
             " max=" + std::to_string(maximumHoles));
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
  expect(readyFeatures.unfillableCavityCells == 0,
         "a cavity fillable by a reachable SRS TSD must not be rejected");
  expect(tetris::evaluateExpertBoard(ready).unownedHoleCells == 0,
         "the single covered cell in a reachable TSD must remain intentional");

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

void testExpertRejectsSidePocketBesideSingleWell() {
  tetris::Board cleanWell;
  tetris::Board sidePocket;
  for (int row = visibleRow(17); row <= visibleRow(19); ++row) {
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col == 3) continue;
      cleanWell.set(row, col, tetris::Cell::J);
      if (row != visibleRow(19) || col != 2) {
        sidePocket.set(row, col, tetris::Cell::J);
      }
    }
  }

  const auto clean = tetris::evaluateExpertBoard(cleanWell);
  const auto damaged = tetris::evaluateExpertBoard(sidePocket);
  expect(clean.holes == 0 && clean.unownedHoleCells == 0,
         "a straight single Well must remain hole-free");
  expect(damaged.holes == 1 && damaged.unownedHoleCells == 1,
         "the widened bottom beside a Well must be an unowned side pocket");
  expect(damaged.reachableTSpinDoublePatterns == 0,
         "a J-shaped side pocket must not receive a TSD-hole exemption");
  expect(clean.value > damaged.value + 1000.0,
         "Expert must strongly prefer a straight Well over the tmp-shaped "
         "side pocket");
}

void testExpertKeepsCleanSoloStackFreeOfUnownedHoles() {
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 5000);
  // This regression targets ordinary stacking, not intentional TD cavities.
  // An initial request without enough Next disables the opening book.
  const auto warmup = agent.decide(tetris::DecisionContext{});
  expect(warmup && agent.lastOpeningName().empty(), "ordinary stacking test must disable openers");
  int maximumUnownedHoles = 0;
  const auto result = tetris::simulateGame(
      agent, 982451653U, 80,
      [&](const tetris::Board& board, const tetris::GameResult&,
          tetris::PieceType, int, std::optional<tetris::PieceType>) {
        maximumUnownedHoles = std::max(
            maximumUnownedHoles,
            tetris::evaluateExpertBoard(board).unownedHoleCells);
      });
  expect(result.reachedPieceLimit && !result.invalidDecision,
         "Expert must complete the side-pocket regression simulation");
  expect(maximumUnownedHoles == 0,
         "Expert must not create holes outside reachable TSD cavities while "
         "building a clean solo stack");
}

void testExpertDetectsCellsNoPieceCanFill() {
  tetris::Board sealed;
  for (int row = visibleRow(17); row <= visibleRow(19); ++row) {
    for (int col = 3; col <= 5; ++col) {
      if (row != visibleRow(18) || col != 4) {
        sealed.set(row, col, tetris::Cell::J);
      }
    }
  }

  const auto sealedFeatures = tetris::extractExpertPatternFeatures(sealed);
  const auto sealedEvaluation = tetris::evaluateExpertBoard(sealed);
  expect(sealedFeatures.unfillableCavityCells == 1 &&
             sealedEvaluation.unfillableCavityCells == 1,
         "a sealed cell which no legal spin/drop can occupy must be counted");

  tetris::Board repaired = sealed;
  repaired.set(visibleRow(18), 4, tetris::Cell::T);
  expect(tetris::extractExpertPatternFeatures(repaired)
             .unfillableCavityCells == 0,
         "repairing the sealed cell must remove the unfillable feature");
  expect(tetris::evaluateExpertBoard(repaired).value >
             sealedEvaluation.value,
         "Expert must strongly prefer a board without unfillable cavities");
}

void testExpertOnlyBuildsTSpinSetupsOnCleanBoards() {
  tetris::Board clean;
  clean.set(visibleRow(19), 3, tetris::Cell::J);
  clean.set(visibleRow(19), 5, tetris::Cell::J);
  expect(tetris::extractExpertPatternFeatures(clean)
             .preTSpinDoublePatterns >= 1,
         "clean setup fixture must contain a preparatory TSD pattern");
  const auto cleanEvaluation = tetris::evaluateExpertBoard(clean);
  expect(cleanEvaluation.cleanForTSpinSetup,
         "a low, hole-free board may construct a T-Spin setup");

  tetris::Board dirty = clean;
  dirty.set(visibleRow(17), 0, tetris::Cell::J);
  dirty.set(visibleRow(19), 0, tetris::Cell::J);
  const auto dirtyEvaluation = tetris::evaluateExpertBoard(dirty);
  expect(dirtyEvaluation.holes == 1 &&
             !dirtyEvaluation.cleanForTSpinSetup,
         "one unrelated buried hole must disable T-Spin construction");

  tetris::Board deepWell;
  for (int row = visibleRow(15); row < tetris::kBoardRows; ++row) {
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col != 4) deepWell.set(row, col, tetris::Cell::J);
    }
  }
  expect(!tetris::evaluateExpertBoard(deepWell).cleanForTSpinSetup,
         "a Well deeper than four rows must disable T-Spin construction");
}

void testExpertSevenBagTAvailability() {
  const std::vector<tetris::PieceType> next{
      tetris::PieceType::I, tetris::PieceType::O, tetris::PieceType::T,
      tetris::PieceType::S};

  const tetris::ExpertTAvailability held =
      tetris::determineExpertTAvailability(tetris::PieceType::T, next);
  expect(held.inHold && held.exact && held.movesUntilPiece == 0 &&
             held.visibleCount == 2,
         "held T must be immediately available");

  const tetris::ExpertTAvailability visible =
      tetris::determineExpertTAvailability(std::nullopt, next);
  expect(!visible.inHold && visible.exact && visible.movesUntilPiece == 3 &&
             visible.visibleCount == 1,
         "visible T distance must be measured from the current Next head");

  const tetris::ExpertTAvailability afterTwo =
      tetris::determineExpertTAvailability(std::nullopt, next, 2);
  expect(afterTwo.exact && afterTwo.movesUntilPiece == 1,
         "beam-state Next index must shift the visible T distance");

  const std::vector<tetris::PieceType> withoutT{
      tetris::PieceType::I, tetris::PieceType::O, tetris::PieceType::S,
      tetris::PieceType::Z, tetris::PieceType::J};
  const tetris::ExpertTAvailability hidden =
      tetris::determineExpertTAvailability(std::nullopt, withoutT);
  expect(!hidden.exact && !hidden.inHold &&
             hidden.movesUntilPiece == 13 && hidden.visibleCount == 0,
         "hidden T must use the conservative maximum 7-bag interval");
}

void testExpertSevenBagIAvailability() {
  const std::vector<tetris::PieceType> next{
      tetris::PieceType::O, tetris::PieceType::S, tetris::PieceType::I,
      tetris::PieceType::Z, tetris::PieceType::J, tetris::PieceType::I};

  const tetris::ExpertIAvailability visible =
      tetris::determineExpertIAvailability(std::nullopt, next);
  expect(visible.exact && !visible.inHold &&
             visible.movesUntilPiece == 3 && visible.visibleCount == 2,
         "I availability must count its distance and visible 7-bag supply");

  const tetris::ExpertIAvailability held =
      tetris::determineExpertIAvailability(tetris::PieceType::I, next, 3);
  expect(held.exact && held.inHold && held.movesUntilPiece == 0 &&
             held.visibleCount == 2,
         "held I and a later visible I must both count as well supply");
}

void testExpertWellRewardFollowsIAvailability() {
  auto makeWell = [](int depth, int wellColumn = 4) {
    tetris::Board board;
    for (int row = tetris::kBoardRows - depth;
         row < tetris::kBoardRows; ++row) {
      for (int col = 0; col < tetris::kBoardCols; ++col) {
        if (col == wellColumn) continue;
        board.set(row, col, tetris::Cell::J);
      }
    }
    return board;
  };

  tetris::ExpertWeights weights;
  weights.boardStabilityMultiplier = 0.0;
  weights.readyTSpinDoubleReward = 0.0;
  weights.completedTSpinDoublePatternReward = 0.0;
  weights.preTSpinDoubleReward = 0.0;
  weights.wellDistance0Penalty = 0.0;
  weights.wellDistance1Penalty = 0.0;
  weights.wellDistance2Reward = 0.0;
  weights.wellDistance3Reward = 0.0;
  weights.wellDistance4Reward = 0.0;

  const tetris::ExpertIAvailability nearI =
      tetris::determineExpertIAvailability(
          std::nullopt, {tetris::PieceType::I});
  const tetris::ExpertIAvailability noVisibleI =
      tetris::determineExpertIAvailability(
          std::nullopt, {tetris::PieceType::O, tetris::PieceType::T});
  const double supported =
      tetris::evaluateExpertBoard(makeWell(4), weights, {}, nearI).value;
  const double unsupported =
      tetris::evaluateExpertBoard(makeWell(4), weights, {}, noVisibleI).value;
  expect(supported > unsupported,
         "a four-row Well must be valued more when its I is visible");

  auto likelySoon = noVisibleI;
  likelySoon.forecast = true;
  likelySoon.arrivalProbability[1] = 1.0;
  auto likelyLate = noVisibleI;
  likelyLate.forecast = true;
  likelyLate.arrivalProbability[13] = 1.0;
  auto mixed = noVisibleI;
  mixed.forecast = true;
  mixed.arrivalProbability[1] = mixed.arrivalProbability[13] = 0.5;
  const auto expectedValue = [&](const auto& availability) {
    return tetris::evaluateExpertBoard(makeWell(4), weights, {}, availability).value;
  };
  expect(expectedValue(likelySoon) > expectedValue(likelyLate),
         "unseen I arrival probabilities must affect the actual board evaluation");
  expect(std::abs(expectedValue(mixed) -
      (expectedValue(likelySoon) + expectedValue(likelyLate)) / 2.0) < 1e-8,
      "evaluate the probability-weighted outcomes, not the optimistic arrival");
  expect(!mixed.exact && mixed.visibleCount == 0,
         "probabilistic supply must not masquerade as a known usable I");

  const tetris::ExpertIAvailability delayedI =
      tetris::determineExpertIAvailability(
          std::nullopt, {tetris::PieceType::O, tetris::PieceType::I});
  const double immediateThreeDeep =
      tetris::evaluateExpertBoard(makeWell(3), weights, {}, nearI).value;
  const double delayedThreeDeep =
      tetris::evaluateExpertBoard(makeWell(3), weights, {}, delayedI).value;
  expect(immediateThreeDeep > delayedThreeDeep,
         "a three-row Well must be strongly rejected unless I is immediately "
         "usable");

  const double oneIForEightRows =
      tetris::evaluateExpertBoard(makeWell(8), weights, {}, nearI).value;
  expect(supported > oneIForEightRows,
         "one I must not reward extending a Well beyond four rows");
  const tetris::ExpertIAvailability twoVisibleI =
      tetris::determineExpertIAvailability(
          tetris::PieceType::I,
          {tetris::PieceType::O, tetris::PieceType::I});
  const double twoIForEightRows =
      tetris::evaluateExpertBoard(makeWell(8), weights, {}, twoVisibleI).value;
  expect(twoIForEightRows > oneIForEightRows,
         "visible I supply must still reduce an existing Well deficit");
  expect(supported > twoIForEightRows,
         "extra visible I pieces must not justify growing one Well beyond "
         "four rows");
}

void testExpertRecognizesStructuredSplitStacks() {
  auto makeWell = [](int wellColumn) {
    tetris::Board board;
    for (int row = visibleRow(16); row < tetris::kBoardRows; ++row) {
      for (int col = 0; col < tetris::kBoardCols; ++col) {
        if (col != wellColumn) {
          board.set(row, col, tetris::Cell::J);
        }
      }
    }
    return board;
  };

  const tetris::Board fourFive = makeWell(4);
  const tetris::Board sixThree = makeWell(6);
  const tetris::Board edge = makeWell(9);
  const tetris::ExpertPatternFeatures fourFiveFeatures =
      tetris::extractExpertPatternFeatures(fourFive);
  const tetris::ExpertPatternFeatures sixThreeFeatures =
      tetris::extractExpertPatternFeatures(sixThree);
  const tetris::ExpertPatternFeatures edgeFeatures =
      tetris::extractExpertPatternFeatures(edge);
  expect(fourFiveFeatures.structuredWellColumn == 4 &&
             fourFiveFeatures.structuredWellDepth == 4 &&
             fourFiveFeatures.structuredSideRoughness == 0,
         "a flat 4-5 stack must be recognized as a structured Well");
  expect(sixThreeFeatures.structuredWellColumn == 6 &&
             sixThreeFeatures.structuredWellDepth == 4,
         "a flat 6-3 stack must be recognized as a structured Well");
  expect(fourFiveFeatures.attackLaneColumn == 4 &&
             fourFiveFeatures.attackLaneDepth == 4 &&
             sixThreeFeatures.attackLaneColumn == 6 &&
             sixThreeFeatures.attackLaneDepth == 4,
         "completed 4-5 and 6-3 stacks must retain their attack lanes");
  expect(edgeFeatures.structuredWellColumn == -1 &&
             edgeFeatures.competingWellUnits > 0,
         "an edge Well must not be treated as a split-stack structure");

  tetris::ExpertWeights weights;
  weights.boardStabilityMultiplier = 0.0;
  weights.readyTSpinDoubleReward = 0.0;
  weights.completedTSpinDoublePatternReward = 0.0;
  weights.preTSpinDoubleReward = 0.0;
  weights.wellDistance0Penalty = 0.0;
  weights.wellDistance1Penalty = 0.0;
  weights.wellDistance2Reward = 0.0;
  weights.wellDistance3Reward = 0.0;
  weights.wellDistance4Reward = 0.0;
  const tetris::ExpertIAvailability availableI =
      tetris::determineExpertIAvailability(
          tetris::PieceType::I, {});
  const double structuredValue =
      tetris::evaluateExpertBoard(fourFive, weights, {}, availableI).value;
  const double edgeValue =
      tetris::evaluateExpertBoard(edge, weights, {}, availableI).value;
  expect(structuredValue > edgeValue,
         "a 4-5 structure must score above an edge Well");

  tetris::Board rough = fourFive;
  rough.set(visibleRow(15), 0, tetris::Cell::J);
  rough.set(visibleRow(15), 2, tetris::Cell::J);
  rough.set(visibleRow(14), 2, tetris::Cell::J);
  rough.set(visibleRow(13), 2, tetris::Cell::J);
  const auto roughFeatures = tetris::extractExpertPatternFeatures(rough);
  expect(roughFeatures.structuredSideRoughness > 0 &&
             roughFeatures.attackLaneSideExcessRoughness > 0,
         "uneven split-stack surfaces must expose roughness");
  expect(structuredValue >
             tetris::evaluateExpertBoard(rough, weights, {}, availableI).value,
         "flat side blocks must score above a jagged split stack");

  tetris::Board developing;
  const std::array<int, tetris::kBoardCols> developingHeights{
      2, 2, 1, 2, 0, 2, 2, 2, 1, 2};
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    for (int height = 0; height < developingHeights[col]; ++height) {
      developing.set(tetris::kBoardRows - 1 - height, col,
                     tetris::Cell::J);
    }
  }
  const auto developingFeatures =
      tetris::extractExpertPatternFeatures(developing);
  expect(developingFeatures.structuredWellDepth == 1 &&
             developingFeatures.attackLaneColumn == 4 &&
             developingFeatures.attackLaneDepth == 2,
         "a developing split stack must expose its attack lane before every "
         "row becomes a strict nine-cell Well");

  tetris::Board twoShafts;
  for (int row = visibleRow(12); row < tetris::kBoardRows; ++row) {
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col != 4 && col != 7) {
        twoShafts.set(row, col, tetris::Cell::J);
      }
    }
  }
  const auto twoShaftFeatures =
      tetris::extractExpertPatternFeatures(twoShafts);
  expect(twoShaftFeatures.structuredWellColumn == -1 &&
             twoShaftFeatures.structuredWellDepth == 0 &&
             twoShaftFeatures.openWellCount == 2 &&
             twoShaftFeatures.openWellDepthSum == 16 &&
             twoShaftFeatures.openWellPieceDemand == 4 &&
             twoShaftFeatures.primaryOpenWellColumn == 4 &&
             twoShaftFeatures.competingWellUnits >= 64,
         "two parallel eight-row shafts must both be detected");
  const tetris::Board oneShaft = [&] {
    tetris::Board result;
    for (int row = visibleRow(12); row < tetris::kBoardRows; ++row) {
      for (int col = 0; col < tetris::kBoardCols; ++col) {
        if (col != 4) result.set(row, col, tetris::Cell::J);
      }
    }
    return result;
  }();
  expect(tetris::evaluateExpertBoard(oneShaft, weights, {}, availableI).value >
             tetris::evaluateExpertBoard(twoShafts, weights, {}, availableI)
                 .value,
         "one supported Well must score above two competing deep shafts");
}

void testExpertPreventsSecondWellBeforeItBecomesDeep() {
  auto makeSurface = [](const std::array<int, tetris::kBoardCols>& heights) {
    tetris::Board board;
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      for (int height = 0; height < heights[col]; ++height) {
        board.set(tetris::kBoardRows - 1 - height, col, tetris::Cell::J);
      }
    }
    return board;
  };

  const tetris::Board oneWell =
      makeSurface({3, 3, 3, 3, 1, 3, 3, 3, 3, 3});
  const auto oneWellFeatures =
      tetris::extractExpertPatternFeatures(oneWell);
  expect(oneWellFeatures.openWellCount == 1 &&
             oneWellFeatures.openWellDepthSum == 2 &&
             oneWellFeatures.openWellPieceDemand == 1 &&
             oneWellFeatures.primaryOpenWellColumn == 4 &&
             oneWellFeatures.competingWellUnits == 0,
         "one central two-row valley must be reserved as the primary Well");

  const tetris::Board twoWells =
      makeSurface({3, 3, 3, 3, 1, 3, 3, 1, 3, 3});
  const auto twoWellFeatures =
      tetris::extractExpertPatternFeatures(twoWells);
  expect(twoWellFeatures.openWellCount == 2 &&
             twoWellFeatures.openWellDepthSum == 4 &&
             twoWellFeatures.openWellPieceDemand == 2 &&
             twoWellFeatures.primaryOpenWellColumn == 4 &&
             twoWellFeatures.competingWellUnits >= 4,
         "a second surface valley must be detected at depth two");

  // Column 7 is only one row low initially. Placing O over columns 8/9 would
  // raise its right wall and turn it into a second two-row Well. There are
  // safe placements elsewhere, so a strong transition penalty must reject
  // that stacking order before the new Well grows deeper.
  const tetris::Board almostTwoWells =
      makeSurface({3, 3, 3, 3, 1, 3, 3, 1, 1, 1});
  const auto before = tetris::extractExpertPatternFeatures(almostTwoWells);
  expect(before.openWellCount == 1,
         "the prospective second Well must start below the detection depth");
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 200000);
  const auto decision = agent.decide(
      almostTwoWells, tetris::PieceType::O, {}, std::nullopt, false);
  expect(decision.has_value(),
         "expert must find a placement while a second Well is forming");
  const tetris::Board after = tetris::clearLines(
      tetris::lockMino(almostTwoWells, decision->placement)).board;
  expect(tetris::extractExpertPatternFeatures(after).openWellCount <= 1,
         "expert must choose an order which does not create a second Well");
}

void testExpertKeepsChosenSplitAttackLaneOpen() {
  tetris::ExpertWeights weights;
  weights.attackLaneObstructionPenalty = 1.0e9;
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), weights, 200000);
  const auto decision = agent.decide(
      tetris::Board{}, tetris::PieceType::O,
      {tetris::PieceType::J, tetris::PieceType::L}, std::nullopt, false);
  expect(decision.has_value(),
         "expert must place the opening piece around a central split lane");
  const tetris::Board after =
      tetris::lockMino(tetris::Board{}, decision->placement);
  const int lane = agent.attackLaneColumn();
  expect(lane >= 3 && lane <= 6, "all four central split lanes are allowed");
  for (int row = 0; row < tetris::kBoardRows; ++row) {
    expect(after.cells()[row][lane] == tetris::Cell::Empty,
           "ordinary opening pieces must preserve the actually selected lane");
  }
}

void testExpertSelectsMirroredSplitAttackLanes() {
  for (int lane = 3; lane <= 6; ++lane) {
    tetris::Board board;
    for (int row = tetris::kBoardRows - 2; row < tetris::kBoardRows; ++row)
      for (int col = 0; col < tetris::kBoardCols; ++col)
        if (col != lane) board.set(row, col, tetris::Cell::J);
    tetris::Board mirrored;
    for (int row = 0; row < tetris::kBoardRows; ++row)
      for (int col = 0; col < tetris::kBoardCols; ++col)
        mirrored.set(row, tetris::kBoardCols - 1 - col, board.cells()[row][col]);
    const auto originalValue = tetris::evaluateExpertBoard(board);
    const auto mirroredValue = tetris::evaluateExpertBoard(mirrored);
    expect(std::abs(originalValue.value - mirroredValue.value) < 1.0e-6 &&
               originalValue.attackLaneColumn == lane &&
               mirroredValue.attackLaneColumn == 9 - lane,
           "mirrored flat split stacks must receive the same board evaluation");
    tetris::ExpertWeights weights;
    weights.attackLaneObstructionPenalty = 1.0e9;
    tetris::ExpertAgent agent(std::chrono::milliseconds(100), weights, 200000);
    expect(agent.attackLaneColumn() == -1,
           "a new Expert must not default to a right-hand lane");
    for (int turn = 0; turn < 2; ++turn) {
      const auto decision = agent.decide(
          board, tetris::PieceType::O, {}, std::nullopt, false);
      expect(decision && agent.attackLaneColumn() == lane,
             "Expert must select and retain each mirrored split from the board");
      board = tetris::clearLines(tetris::lockMino(board, decision->placement)).board;
      for (int row = 0; row < tetris::kBoardRows; ++row)
        expect(board.cells()[row][lane] == tetris::Cell::Empty,
               "both orientations must preserve their chosen Well");
    }
  }
}

void testExpertPenalizesOverbuiltWellShoulders() {
  const auto stack = [](const std::array<int, tetris::kBoardCols>& heights) {
    auto board = makeSolidColumns(heights);
    // These are self-built stacks, not garbage shafts (which are exempt
    // from selection as the planned attack lane).
    for (int row = 0; row < tetris::kBoardRows; ++row)
      for (int col = 0; col < tetris::kBoardCols; ++col)
        if (board.cells()[row][col] != tetris::Cell::Empty)
          board.set(row, col, tetris::Cell::J);
    return board;
  };
  const auto tall = stack({2, 2, 2, 7, 0, 7, 2, 2, 2, 2});
  const auto flat = stack({3, 3, 3, 3, 0, 4, 3, 3, 3, 3});
  const auto lip = stack({2, 2, 2, 4, 0, 4, 2, 2, 2, 2});
  const auto mirrored = stack({2, 2, 2, 2, 7, 0, 7, 2, 2, 2});
  const auto a = tetris::evaluateExpertBoard(tall);
  const auto b = tetris::evaluateExpertBoard(flat);
  expect(a.aggregateHeight == b.aggregateHeight,
         "shoulder comparison must use equal occupied-cell counts");
  expect(a.attackLaneShoulderExcess == 18 &&
             b.attackLaneShoulderExcess == 0 && a.value < b.value,
         "two tall shoulders must be worse than spreading the same cells flat");
  expect(tetris::evaluateExpertBoard(lip).attackLaneShoulderExcess == 0,
         "a two-row TSD lip must not receive the shoulder penalty");
  expect(tetris::evaluateExpertBoard(mirrored).attackLaneShoulderExcess == 18,
         "overbuilt shoulders must be detected symmetrically");
  const auto uniform = stack({8, 8, 8, 8, 0, 8, 8, 8, 8, 8});
  expect(tetris::evaluateExpertBoard(uniform).attackLaneShoulderExcess == 0,
         "absolute height alone must not count as shoulder protrusion");

  tetris::ExpertWeights withoutPenalty;
  withoutPenalty.attackLaneShoulderPenalty = 0;
  const auto nearT = tetris::determineExpertTAvailability(tetris::PieceType::T, {});
  const auto farT = tetris::determineExpertTAvailability(std::nullopt, {});
  const double nearCost = tetris::evaluateExpertBoard(tall, withoutPenalty, nearT).value -
      tetris::evaluateExpertBoard(tall, {}, nearT).value;
  const double farCost = tetris::evaluateExpertBoard(tall, withoutPenalty, farT).value -
      tetris::evaluateExpertBoard(tall, {}, farT).value;
  expect(farCost > 0 && std::abs(nearCost - 1.5 * farCost) < 1.0e-6,
         "nearby T must increase the dedicated shoulder cost without rewarding a cavity");

  tetris::ExpertAgent agent(std::chrono::milliseconds(50), {}, 150000);
  const auto decision = agent.decide(
      tall, tetris::PieceType::O, {}, std::nullopt, false);
  expect(decision.has_value(), "Expert must find a repair for overbuilt shoulders");
  const auto after = tetris::evaluateExpertBoard(
      tetris::clearLines(tetris::lockMino(tall, decision->placement)).board);
  expect(after.holes == 0 && after.attackLaneShoulderExcess < a.attackLaneShoulderExcess,
         "Expert must fill the lower block instead of adding to its tall shoulders");
}

void testExpertWaitsForFourthTetrisRow() {
  tetris::Board board;
  for (int row = tetris::kBoardRows - 3;
       row < tetris::kBoardRows; ++row) {
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col != 5) board.set(row, col, tetris::Cell::J);
    }
  }
  tetris::ExpertWeights weights;
  weights.iCashoutDelayPenalty = 1.0e9;
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), weights, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::I,
      {tetris::PieceType::O, tetris::PieceType::J}, std::nullopt, false);
  expect(decision.has_value() && decision->linesCleared != 3,
         "a safe three-row 5-4 Well must preserve I until the fourth row");
}

void testExpertPricesWellDemandAgainstVisibleISupply() {
  tetris::Board twoDeepWells;
  for (int row = tetris::kBoardRows - 5; row < tetris::kBoardRows; ++row) {
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col != 4 && col != 7) {
        twoDeepWells.set(row, col, tetris::Cell::J);
      }
    }
  }
  const auto features =
      tetris::extractExpertPatternFeatures(twoDeepWells);
  expect(features.openWellPieceDemand == 4,
         "two five-row Wells must require four I pieces in total");

  tetris::ExpertWeights weights;
  weights.boardStabilityMultiplier = 0.0;
  weights.wellReward = 0.0;
  weights.structuredStackReward = 0.0;
  weights.structuredSideRoughnessPenalty = 0.0;
  weights.competingWellPenalty = 0.0;
  weights.unsupportedWellPenalty = 0.0;
  weights.waitingWellPenalty = 0.0;
  weights.readyTSpinDoubleReward = 0.0;
  weights.completedTSpinDoublePatternReward = 0.0;
  weights.preTSpinDoubleReward = 0.0;
  weights.wellDistance0Penalty = 0.0;
  weights.wellDistance1Penalty = 0.0;
  weights.wellDistance2Reward = 0.0;
  weights.wellDistance3Reward = 0.0;
  weights.wellDistance4Reward = 0.0;

  const auto oneVisibleI = tetris::determineExpertIAvailability(
      std::nullopt, {tetris::PieceType::I});
  const auto fourVisibleI = tetris::determineExpertIAvailability(
      tetris::PieceType::I,
      {tetris::PieceType::I, tetris::PieceType::I,
       tetris::PieceType::I});
  const double underSupplied = tetris::evaluateExpertBoard(
      twoDeepWells, weights, {}, oneVisibleI).value;
  const double fullySupplied = tetris::evaluateExpertBoard(
      twoDeepWells, weights, {}, fourVisibleI).value;
  expect(fullySupplied > underSupplied,
         "Well demand beyond visible I supply must lower board value");
}

void testExpertImmediatelyResolvesSecondWellWithI() {
  tetris::Board board;
  for (int row = tetris::kBoardRows - 4; row < tetris::kBoardRows; ++row) {
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col != 4 && col != 7) board.set(row, col, tetris::Cell::J);
    }
  }
  expect(tetris::extractExpertPatternFeatures(board).openWellCount == 2,
         "multiple-Well recovery fixture must start with two Wells");

  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::I, {}, std::nullopt, false);
  expect(decision.has_value(),
         "expert must place I while two Wells are present");
  const tetris::Board after = tetris::clearLines(
      tetris::lockMino(board, decision->placement)).board;
  const auto afterFeatures = tetris::extractExpertPatternFeatures(after);
  expect(afterFeatures.openWellCount == 1,
         "expert must immediately fill one of two Wells instead of extending "
         "both");
  expect(tetris::evaluateExpertBoard(after).holes == 0,
         "resolving the second Well must not roof it into buried holes");
}

void testExpertDoesNotBuryOpenShaft() {
  tetris::Board board;
  for (int row = visibleRow(12); row < tetris::kBoardRows; ++row) {
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col != 4) board.set(row, col, tetris::Cell::J);
    }
  }
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::O, {tetris::PieceType::I},
      std::nullopt, false);
  expect(decision.has_value(),
         "expert must decide while preserving an open recovery shaft");
  const tetris::Board after = tetris::clearLines(
      tetris::lockMino(board, decision->placement)).board;
  expect(tetris::evaluateExpertBoard(after).holes == 0,
         "expert must not bridge an open shaft and turn it into buried holes");
}

void testExpertUsesIToLowerDangerousStructuredStack() {
  tetris::Board board;
  for (int row = visibleRow(8); row < tetris::kBoardRows; ++row) {
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      if (col != 4) board.set(row, col, tetris::Cell::Garbage);
    }
  }
  const auto garbageShaft = tetris::extractExpertPatternFeatures(board);
  expect(garbageShaft.structuredWellColumn == -1 &&
             garbageShaft.competingWellUnits == 0 &&
             garbageShaft.garbageRecoveryShaftDepth == 12,
         "an incoming garbage channel must be reserved for excavation");
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::O,
      {tetris::PieceType::T, tetris::PieceType::S},
      tetris::PieceType::I, true);
  expect(decision.has_value() && !decision->actions.empty() &&
             decision->actions.front() == tetris::Action::Hold &&
             decision->placement.type == tetris::PieceType::I &&
             decision->linesCleared == 4,
         "a dangerous split stack must cash out its held I as a Tetris");
  const tetris::Board after = tetris::clearLines(
      tetris::lockMino(board, decision->placement)).board;
  const int removedGarbageCells =
      tetris::evaluateExpertBoard(board).garbageCells -
      tetris::evaluateExpertBoard(after).garbageCells;
  expect(removedGarbageCells == 36,
         "the recovery Tetris must excavate four nine-cell garbage rows");
}

void testExpertEmergencyModeBreaksB2BToLowerHeight() {
  tetris::Board board;
  for (int row = tetris::kBoardRows - 15; row < tetris::kBoardRows; ++row) {
    board.set(row, 0, tetris::Cell::J);
  }
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col != 4 && col != 5) {
      board.set(tetris::kBoardRows - 1, col, tetris::Cell::J);
    }
  }
  expect(tetris::evaluateExpertBoard(board).maximumHeight == 15,
         "emergency fixture must start at the recovery threshold");

  tetris::ExpertWeights weights;
  weights.backToBackBreakPenalty = 1.0e12;
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), weights, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::O, {}, std::nullopt, false,
      3, tetris::kSpawnY, 0, true);
  expect(decision.has_value() && decision->linesCleared == 1,
         "emergency mode must take a height-reducing Single even when it "
         "breaks B2B");
  const tetris::Board after = tetris::clearLines(
      tetris::lockMino(board, decision->placement)).board;
  expect(tetris::evaluateExpertBoard(after).maximumHeight < 15,
         "emergency placement must lower the maximum stack height");
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

void testExpertEvaluatesDonationUnlocks() {
  // This solid stack can expose a reachable TSD by clearing two rows with L.
  const auto board = makeSolidColumns({5, 4, 4, 5, 6, 3, 4, 3, 2, 3});
  tetris::ActivePiece donor{tetris::PieceType::L, 5, tetris::kSpawnY, 2};
  donor.y = tetris::calcGhostY(board, donor);
  const auto nearT = tetris::determineExpertTAvailability(
      std::nullopt, {tetris::PieceType::T});
  expect(tetris::expertDonationLines(board, donor, nearT) == 2,
         "L line clear must unlock and evaluate a real TSD donation");
  expect(tetris::expertDonationLines(board, donor, {}) == 0,
         "a donation must not reserve an invisible future T");
  auto dirty = board;
  dirty.set(30, 0, tetris::Cell::J);
  expect(tetris::expertDonationLines(dirty, donor, nearT) == 0,
         "a donation must not excuse unrelated buried holes");
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 20000);
  const auto decision = agent.decide(board, tetris::PieceType::L,
                                    {tetris::PieceType::T}, std::nullopt, false);
  expect(decision && tetris::expertDonationLines(board, decision->placement, nearT) == 2,
         "Expert must choose the donor move and preserve the follow-up TSD");
  const auto after = tetris::clearLines(tetris::lockMino(board, decision->placement)).board;
  const auto followup = agent.decide(after, tetris::PieceType::T, {}, std::nullopt, false);
  expect(followup && followup->linesCleared == 2,
         "Expert must cash out the donation with the next T");

  // A line underneath an existing TSD moves it down without opening a new one.
  tetris::Board shifted;
  shifted.set(36, 3, tetris::Cell::J);
  for (int col = 0; col < 10; ++col) {
    if (col < 3 || col > 5) shifted.set(37, col, tetris::Cell::J);
    if (col != 4) shifted.set(38, col, tetris::Cell::J);
    if (col < 6) shifted.set(39, col, tetris::Cell::J);
  }
  const tetris::ActivePiece clearBelow{tetris::PieceType::I, 6, 38, 0};
  expect(tetris::evaluateExpertBoard(shifted).reachableTSpinDoublePatterns == 1,
         "shift fixture must already contain a reachable TSD");
  expect(tetris::expertDonationLines(shifted, clearBelow, nearT) == 0,
         "moving an existing TSD down with a line clear must not count as donation");
}

void testExpertDonationTemplates() {
  struct Fixture {
    std::string_view name;
    std::array<std::string, 6> rows;
    std::vector<tetris::PieceType> donors;
  };
  using P = tetris::PieceType;
  const std::vector<Fixture> fixtures{
      {"O", {"----------", "----cc----", "oo---ccccc", "ooc-cccccc", "-ccccccccc", "-ccccccccc"}, {P::O}},
      {"stairs", {"----------", "---cc-----", "s---cccccc", "ss-ccccccc", "-scccccccc", "-ccccccccc"}, {P::S}},
      {"Z", {"----------", "-z--cc----", "zz---ccccc", "zcc-cccccc", "-ccccccccc", "-ccccccccc"}, {P::Z}},
      {"parapet", {"----------", "l--cc-----", "l---cccccc", "ll-ccccccc", "c-cccccccc", "c-cccccccc"}, {P::L}},
      {"L-flat", {"----------", "-----cc---", "lll---cccc", "lccc-ccccc", "-ccccccccc", "-ccccccccc"}, {P::L}},
      {"JZ-A", {"--z-------", "-zz-------", "jz---ccccc", "jjj-cccccc", "-ccccccccc", "-ccccccccc"}, {P::J, P::Z}},
      {"JZ-B", {"----------", "--zz-j----", "---zzjcccc", "c-ccjjcccc", "cccc-ccccc", "cccc-ccccc"}, {P::J, P::Z}},
      {"STMB-cave", {"--z-------", "-zz-------", "cz---ssccc", "ccc-sscccc", "ccc---cccc", "cccc-ccccc"}, {P::S, P::Z}},
      {"SZ-B", {"--z-------", "-zz-------", "sz---ccccc", "ssc-cccccc", "-scccccccc", "-ccccccccc"}, {P::S, P::Z}},
      {"JS-A", {"----------", "------cc--", "jjss---ccc", "jsscc-cccc", "j-cccccccc", "c-cccccccc"}, {P::J, P::S}},
      {"JS-B", {"----------", "--ss------", "jss---cccc", "jjjc-ccccc", "--cccccccc", "--cccccccc"}, {P::J, P::S}},
      {"OZ", {"----------", "-z--cc----", "zz---ccccc", "zoo-cccccc", "-ooccccccc", "-ccccccccc"}, {P::O, P::Z}},
  };
  const auto mirrorType = [](P type) {
    if (type == P::S) return P::Z;
    if (type == P::Z) return P::S;
    if (type == P::L) return P::J;
    if (type == P::J) return P::L;
    return type;
  };
  for (const auto& fixture : fixtures) {
    for (const bool mirror : {false, true}) {
      tetris::Board base, assembled;
      for (int row = 0; row < 6; ++row) {
        for (int col = 0; col < 10; ++col) {
          const char cell = fixture.rows[row][col];
          if (cell == '-') continue;
          const int x = mirror ? 9 - col : col;
          assembled.set(34 + row, x, tetris::Cell::J);
          if (cell == 'c') base.set(34 + row, x, tetris::Cell::J);
        }
      }
      auto supply = fixture.donors;
      if (mirror) for (auto& type : supply) type = mirrorType(type);
      supply.push_back(P::T);
      const std::string label = std::string(fixture.name) + (mirror ? " mirrored" : "");
      const auto plan = tetris::findExpertDonationTemplate(base, std::nullopt, supply);
      if (fixture.name == "JS-A") {
        // With this roof already built, neither JS order has a legal route.
        // The named final silhouette must not promise an impossible setup.
        expect(!plan, label + " must reject blocked donor routes under an early roof");
        const auto ready = tetris::findExpertDonationTemplate(assembled, std::nullopt, {P::T});
        expect(ready && ready->setup.empty(), label + " completed terrain must remain usable");
        continue;
      }
      expect(plan.has_value(), label + " must recognize a playable unfinished template");
      expect(!plan->setup.empty() && plan->setup.size() <= 2,
             label + " must value preparation, not just the completed TSD");
      tetris::Board current = base;
      for (const auto& placement : plan->setup) {
        expect(tetris::isValidPosition(current, placement), label + " donor must not collide");
        expect(tetris::calcGhostY(current, placement) == placement.y,
               label + " donor must be grounded (a tuck may be required)");
        current = tetris::lockMino(current, placement);
        expect(tetris::clearLines(current).linesCleared == 0,
               label + " donation preparation must preserve B2B without clearing");
      }
      const auto result = tetris::clearLines(tetris::lockMino(current, plan->target));
      expect(result.linesCleared == 2 && tetris::evaluateExpertBoard(result.board).holes == 0,
             label + " must reopen the lower hole after TSD");
      const auto ready = tetris::findExpertDonationTemplate(assembled, std::nullopt, {P::T});
      expect(ready && ready->setup.empty(), label + " must recognize the completed template");
      expect(!tetris::findExpertDonationTemplate(base, std::nullopt, {P::I, P::I, P::T}),
             label + " must not assume unavailable donor pieces");
      auto dirty = assembled;
      dirty.set(31, mirror ? 0 : 9, tetris::Cell::J);
      expect(!tetris::findExpertDonationTemplate(dirty, std::nullopt, {P::T}),
             label + " must not forgive an unrelated buried cavity");
    }
  }
  // Build O donation + a roof from actual Next, including Hold order and a
  // queue offset. Merely knowing that a T exists somewhere is insufficient.
  tetris::Board open;
  const std::array<std::string, 4> openRows{
      "-----ccccc", "--c-cccccc", "-ccccccccc", "-ccccccccc"};
  for (int row = 0; row < 4; ++row)
    for (int col = 0; col < 10; ++col)
      if (openRows[row][col] == 'c') open.set(36 + row, col, tetris::Cell::J);
  const auto roofPlan = tetris::findExpertDonationTemplate(
      open, std::nullopt, {P::O, P::O, P::T});
  expect(roofPlan && roofPlan->setup.size() == 2,
         "unfinished donation must include a real playable roof placement");
  expect(!tetris::findExpertDonationTemplate(open, std::nullopt, {P::O, P::T}),
         "a missing roof must not be invented");
  auto first = tetris::lockMino(open, roofPlan->setup.front());
  const auto progress = tetris::findExpertDonationTemplate(first, std::nullopt, {P::O, P::T});
  expect(progress && progress->setup.size() == 1,
         "placing a template piece must advance the preparation feature");
  auto covered = tetris::lockMino(first, progress->setup.front());
  covered.set(35, 0, tetris::Cell::J);
  expect(!tetris::findExpertDonationTemplate(covered, std::nullopt, {P::T}),
         "a third covering row left above the shaft must disqualify a donation");
  tetris::Board withRoof = open;
  withRoof.set(35, 4, tetris::Cell::J);
  withRoof.set(35, 5, tetris::Cell::J);
  expect(tetris::findExpertDonationTemplate(withRoof, std::nullopt, {P::T, P::O, P::I}).has_value(),
         "Hold must allow saving an early T until the donor is placed");
  expect(tetris::findExpertDonationTemplate(withRoof, std::nullopt, {P::I, P::O, P::T}, 1).has_value(),
         "template supply must start at the beam's remaining Next index");
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 30000);
  const auto donor = agent.decide(withRoof, P::O, {P::T}, std::nullopt, false);
  expect(donor && donor->linesCleared == 0,
         "Expert must build a donor without an ordinary line clear");
  const auto prepared = tetris::lockMino(withRoof, donor->placement);
  expect(tetris::findExpertDonationTemplate(prepared, std::nullopt, {P::T}).has_value(),
         "Expert must actually choose the recognized donation structure");
  const auto tsd = agent.decide(prepared, P::T, {}, std::nullopt, false);
  expect(tsd && tsd->linesCleared == 2,
         "Expert must cash out the template with the next T");
}

void testExpertRecognizesAndExecutesTSpinTriple() {
  for (const bool mirrored : {false, true}) {
    tetris::Board board;
    const std::array<std::string, 5> rows{
        "0000100000", "0000000000", "1111011111",
        "1111001111", "1111011111"};
    for (int row = 0; row < 5; ++row) {
      for (int col = 0; col < 10; ++col) {
        if (rows[row][col] == '1')
          board.set(35 + row, mirrored ? 9 - col : col, tetris::Cell::J);
      }
    }
    const auto nearT = tetris::determineExpertTAvailability(
        tetris::PieceType::T, {});
    const auto ready = tetris::evaluateExpertBoard(board, {}, nearT);
    expect(ready.reachableTSpinTriplePatterns == 1 &&
               ready.unownedHoleCells == 0,
           "a reachable TST and its kick entrance must be recognized");
    expect(ready.value > tetris::evaluateExpertBoard(board).value + 4000,
           "TST setup reward must require a nearby T");
    tetris::Board dirty = board;
    dirty.set(33, mirrored ? 9 : 0, tetris::Cell::J);
    expect(tetris::evaluateExpertBoard(dirty).unownedHoleCells > 0,
           "a TST must not exempt unrelated holes elsewhere");
    tetris::Board blocked = board;
    for (int col = 0; col < 10; ++col) blocked.set(34, col, tetris::Cell::J);
    expect(tetris::extractExpertPatternFeatures(blocked)
               .completedTSpinTriplePatterns == 0,
           "a sealed TST must not earn reachable-slot credit");

    tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 20000);
    const auto decision = agent.decide(
        board, tetris::PieceType::T, {}, std::nullopt, false);
    expect(decision && decision->linesCleared == 3,
           "Expert must cash out the reachable TST");
    tetris::ActivePiece active{tetris::PieceType::T, 3, tetris::kSpawnY, 0};
    int lastKick = -1;
    for (const auto action : decision->actions) {
      if (action == tetris::Action::MoveLeft) { --active.x; lastKick = -1; }
      else if (action == tetris::Action::MoveRight) { ++active.x; lastKick = -1; }
      else if (action == tetris::Action::SoftDrop) { ++active.y; lastKick = -1; }
      else if (action == tetris::Action::HardDrop) {
        const int y = tetris::calcGhostY(board, active);
        if (y != active.y) lastKick = -1;
        active.y = y;
      } else {
        const auto direction = action == tetris::Action::RotateClockwise
            ? tetris::RotationDirection::Clockwise
            : action == tetris::Action::RotateCounterClockwise
                ? tetris::RotationDirection::CounterClockwise
                : tetris::RotationDirection::Rotate180;
        const auto rotated = tetris::tryRotate(board, active, direction, &lastKick);
        expect(rotated.has_value(), "every TST rotation must replay legally");
        active = *rotated;
      }
      expect(tetris::isValidPosition(board, active), "TST route must be legal");
    }
    expect(active == decision->placement &&
               tetris::detectTSpin(board, active, lastKick >= 0, lastKick, 3) ==
                   tetris::TSpin::Full &&
               tetris::clearLines(tetris::lockMino(board, active)).linesCleared == 3,
           "replayed TST must really rotate and clear three rows");
  }
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

  // Isolate the original hole-depth heuristic. Repairability is tested
  // separately: a single hole can legitimately be worse than two holes when
  // only the latter admits a legal tuck.
  tetris::ExpertWeights weights;
  weights.unfillableCavityPenalty = 0.0;
  const double cleanValue = tetris::evaluateExpertBoard(clean, weights).value;
  const double oneHoleValue =
      tetris::evaluateExpertBoard(oneHole, weights).value;
  const double twoHoleValue =
      tetris::evaluateExpertBoard(twoHoles, weights).value;
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

void testExpertTreatsZeroLineTSpinAsWastedT() {
  tetris::Board board;
  board.set(visibleRow(17), 3, tetris::Cell::Garbage);
  board.set(visibleRow(19), 3, tetris::Cell::Garbage);
  board.set(visibleRow(19), 5, tetris::Cell::Garbage);

  tetris::ExpertWeights weights;
  weights.tWastedPenalty = 1.0e9;
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), weights, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::T, {}, tetris::PieceType::O, true);
  expect(decision.has_value(),
         "expert must decide on a board with a zero-line T-Spin slot");
  expect(!decision->actions.empty() &&
             decision->actions.front() == tetris::Action::Hold,
         "a zero-line T-Spin must not bypass the wasted-T penalty");
}

void testExpertConservesTWithDefaultWeights() {
  for (const bool occupiedHold : {false, true}) {
    tetris::ExpertAgent agent(std::chrono::milliseconds(50), {}, 150000);
    const auto decision = agent.decide(
        tetris::Board{}, tetris::PieceType::T,
        occupiedHold ? std::vector<tetris::PieceType>{} :
                       std::vector<tetris::PieceType>{tetris::PieceType::O},
        occupiedHold ? std::optional{tetris::PieceType::O} : std::nullopt, true);
    expect(decision && decision->placement.type == tetris::PieceType::O &&
               decision->actions.front() == tetris::Action::Hold,
           "default Expert must save T when O can safely build the flat stack");
  }
  tetris::ExpertAgent held(std::chrono::milliseconds(50), {}, 150000);
  const auto keepHeld = held.decide(tetris::Board{}, tetris::PieceType::O,
      {}, tetris::PieceType::T, true);
  expect(keepHeld && keepHeld->placement.type == tetris::PieceType::O &&
             keepHeld->actions.front() != tetris::Action::Hold,
         "Expert must not withdraw its held T for ordinary empty-board stacking");
  tetris::ExpertAgent locked(std::chrono::milliseconds(50), {}, 150000);
  const auto forced = locked.decide(tetris::Board{}, tetris::PieceType::T,
      {tetris::PieceType::O}, std::nullopt, false);
  expect(forced && forced->placement.type == tetris::PieceType::T &&
             forced->actions.front() != tetris::Action::Hold,
         "saving T is a preference, not an illegal Hold when Hold is locked");
}

void testExpertSpendsTForRecoveryAndPerfectClear() {
  tetris::Board danger;
  for (int row = tetris::kBoardRows - 15; row < tetris::kBoardRows; ++row)
    danger.set(row, 0, tetris::Cell::J);
  for (int col = 0; col < tetris::kBoardCols; ++col)
    if (col < 3 || col > 5) danger.set(tetris::kBoardRows - 1, col, tetris::Cell::J);
  tetris::ExpertWeights weights;
  weights.tWastedPenalty = 1.0e9;
  tetris::ExpertAgent recovery(std::chrono::milliseconds(50), weights, 150000);
  const auto clear = recovery.decide(danger, tetris::PieceType::T,
      {}, tetris::PieceType::O, true);
  expect(clear && clear->placement.type == tetris::PieceType::T && clear->linesCleared == 1,
         "even a huge T reserve cost must not prevent an emergency height-reducing clear");

  tetris::Board pc;
  for (int row = tetris::kBoardRows - 2; row < tetris::kBoardRows; ++row)
    for (int col = 0; col < tetris::kBoardCols; ++col) pc.set(row, col, tetris::Cell::J);
  for (const auto cell : tetris::getMinoCells({tetris::PieceType::T, 3, 37, 2}))
    pc.set(cell.row, cell.col, tetris::Cell::Empty);
  tetris::ExpertAgent perfect(std::chrono::milliseconds(50), weights, 150000);
  const auto finish = perfect.decide(pc, tetris::PieceType::T, {}, tetris::PieceType::O, true);
  expect(finish && finish->linesCleared == 2 &&
             tetris::clearLines(tetris::lockMino(pc, finish->placement)).board.empty(),
         "a non-spin perfect clear must not be mistaken for wasted T");
}

void testExpertPricesReplacementTScarcity() {
  const auto cost = [](std::optional<tetris::PieceType> hold) {
    tetris::ExpertWeights zero;
    zero.tWastedPenalty = 0;
    tetris::ExpertAgent priced(std::chrono::milliseconds(50), {}, 150000);
    tetris::ExpertAgent unpriced(std::chrono::milliseconds(50), zero, 150000);
    const auto a = priced.decide(tetris::Board{}, tetris::PieceType::T,
                                 {}, hold, false);
    const auto b = unpriced.decide(tetris::Board{}, tetris::PieceType::T,
                                   {}, hold, false);
    expect(a && b, "forced-T scarcity fixture must have legal placements");
    return a->score - b->score;
  };
  const double unseen = cost(std::nullopt);
  const double spareHeld = cost(tetris::PieceType::T);
  expect(spareHeld > 0 && unseen > 5.0 * spareHeld,
         "using the only T must cost much more than using one while a spare remains held");
}

void testExpertPricesSafeTSpinSingleOpportunityCost() {
  tetris::Board board;
  board.set(visibleRow(17), 3, tetris::Cell::Garbage);
  board.set(visibleRow(17), 5, tetris::Cell::Garbage);
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col < 3 || col > 5)
      board.set(visibleRow(18), col, tetris::Cell::Garbage);
  }
  board.set(visibleRow(19), 3, tetris::Cell::Garbage);
  board.set(visibleRow(19), 5, tetris::Cell::Garbage);

  tetris::ExpertWeights weights;
  weights.tSpinSingleOpportunityPenalty = 1.0e9;
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), weights, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::T, {}, tetris::PieceType::O, true);
  expect(decision.has_value(),
         "expert must decide on a safe board with an available TSS");
  expect(!decision->actions.empty() &&
             decision->actions.front() == tetris::Action::Hold,
         "a safe TSS must account for consuming the only visible T piece");
}

void testExpertPreservesTetrisWellForIncomingI() {
  tetris::Board board;
  board.set(visibleRow(17), 3, tetris::Cell::Garbage);
  board.set(visibleRow(17), 5, tetris::Cell::Garbage);
  for (int col = 0; col < tetris::kBoardCols; ++col) {
    if (col < 3 || col > 5) {
      board.set(visibleRow(18), col, tetris::Cell::Garbage);
    }
  }
  board.set(visibleRow(19), 3, tetris::Cell::Garbage);
  board.set(visibleRow(19), 5, tetris::Cell::Garbage);

  const auto features = tetris::evaluateExpertBoard(board);
  expect(features.attackLaneDepth >= 2,
         "incoming-I fixture must contain a developing Tetris Well");

  tetris::ExpertWeights weights;
  weights.tSpinSingleOpportunityPenalty = 0.0;
  weights.tSpinSingleBlocksTetrisPenalty = 1.0e9;
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), weights, 200000);
  const auto decision = agent.decide(
      board, tetris::PieceType::T,
      {tetris::PieceType::S, tetris::PieceType::Z,
       tetris::PieceType::I},
      tetris::PieceType::O, true);
  expect(decision.has_value(),
         "expert must decide while I is three moves from the Well");
  expect(!decision->actions.empty() &&
             decision->actions.front() == tetris::Action::Hold,
         "expert must not spend a local TSS that delays an incoming-I Tetris");
}

void testExpertUsesDirectHardDropForLineLessT() {
  tetris::ExpertAgent agent(std::chrono::milliseconds(100), {}, 200000);
  const auto decision = agent.decide(
      tetris::Board{}, tetris::PieceType::T, {}, std::nullopt, false);
  expect(decision.has_value() && decision->linesCleared == 0,
         "expert must place a line-less T on an empty board");
  expect(std::find(decision->actions.begin(), decision->actions.end(),
                   tetris::Action::SoftDrop) == decision->actions.end(),
         "a hard-droppable line-less T must not contain SoftDrop actions");
  expect(!decision->actions.empty() &&
             decision->actions.back() == tetris::Action::HardDrop,
         "the normalized T route must still finish with HardDrop");
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

class OpeningReplay {
 public:
  explicit OpeningReplay(std::uint32_t seed) : bag(seed) {
    context.active = bag.next();
    refreshNext();
  }

  int play(const tetris::AgentDecision& decision) {
    auto type = context.active;
    std::size_t first = 0;
    if (decision.actions.front() == tetris::Action::Hold) {
      expect(context.canHold, "opener must respect a locked Hold");
      const auto previous = context.hold;
      context.hold = type;
      type = previous ? *previous : bag.next();
      first = 1;
    }
    tetris::ActivePiece active{type, 3, tetris::kSpawnY, 0};
    int kick = -1;
    bool locked = false;
    for (std::size_t i = first; i < decision.actions.size(); ++i) {
      expect(!locked, "opener must end at its only hard drop");
      const auto action = decision.actions[i];
      if (action == tetris::Action::MoveLeft) { --active.x; kick = -1; }
      else if (action == tetris::Action::MoveRight) { ++active.x; kick = -1; }
      else if (action == tetris::Action::SoftDrop) { ++active.y; kick = -1; }
      else if (action == tetris::Action::HardDrop) {
        const int y = tetris::calcGhostY(context.board, active);
        if (y != active.y) kick = -1;
        active.y = y;
        locked = true;
      } else {
        expect(action != tetris::Action::Hold, "opener may only Hold once at the start");
        const auto direction = action == tetris::Action::RotateClockwise
            ? tetris::RotationDirection::Clockwise
            : action == tetris::Action::RotateCounterClockwise
                ? tetris::RotationDirection::CounterClockwise
                : tetris::RotationDirection::Rotate180;
        const auto rotated = tetris::tryRotate(context.board, active, direction, &kick);
        expect(rotated.has_value(), "opener rotation must replay legally");
        active = *rotated;
      }
      expect(tetris::isValidPosition(context.board, active), "opener movement must not collide");
    }
    expect(locked && active == decision.placement, "opener actions must match its predicted placement");
    const auto clear = tetris::clearLines(tetris::lockMino(context.board, active));
    expect(clear.linesCleared == decision.linesCleared, "opener must predict actual cleared rows");
    const auto spin = tetris::detectTSpin(context.board, active, kick >= 0, kick, clear.linesCleared);
    if (clear.linesCleared > 0) {
      if (spin == tetris::TSpin::Full && clear.linesCleared == 3) ++triples;
      if (spin == tetris::TSpin::Full && clear.linesCleared == 2) ++doubles;
      if (clear.board.empty()) ++perfects;
      attack += tetris::calculateGarbage(clear.linesCleared, spin, clear.board.empty(), context.backToBack > 0);
      if (spin == tetris::TSpin::Full || clear.linesCleared == 4) ++context.backToBack;
      else context.backToBack = 0;
    }
    context.board = clear.board;
    context.active = bag.next();
    refreshNext();
    return clear.linesCleared;
  }

  tetris::DecisionContext context;
  int attack = 0;
  int triples = 0;
  int doubles = 0;
  int perfects = 0;

 private:
  void refreshNext() {
    context.next.clear();
    auto preview = bag;
    for (int i = 0; i < 5; ++i) context.next.push_back(preview.next());
  }
  tetris::BagGenerator bag;
};

void testSevenBagForecast() {
  using tetris::PieceType;
  const auto near = [](double a, double b) { return std::abs(a - b) < 1e-9; };
  tetris::DecisionContext context;
  context.active = PieceType::I;
  context.next = {PieceType::O, PieceType::T, PieceType::S};
  tetris::SevenBagTracker tracker;
  auto forecast = tracker.observe(context);
  const auto z = forecast.arrival(PieceType::Z);
  expect(near(z[1], 1.0 / 3) && near(z[2], 1.0 / 3) && near(z[3], 1.0 / 3),
         "three unseen remaining types have uniform arrival order");
  const auto i = forecast.arrival(PieceType::I);
  expect(near(i[1] + i[2] + i[3], 0.0) && near(i[4], 1.0 / 7) && near(i[10], 1.0 / 7),
         "an already drawn I cannot reappear before the next bag");
  context.next = {PieceType::O, PieceType::T, PieceType::S, PieceType::Z, PieceType::J};
  tetris::SevenBagTracker holdTracker;
  forecast = holdTracker.observe(context);
  expect(near(forecast.arrival(PieceType::L)[1], 1.0), "six known types determine the seventh");
  const tetris::AgentDecision useHold{{PieceType::O, 3, 38, 0},
      {tetris::Action::Hold, tetris::Action::HardDrop}, 0.0, 0};
  holdTracker.commit(context, useHold);
  expect(near(holdTracker.observe(context).arrival(PieceType::L)[1], 1.0),
         "repeated observations must not consume the bag twice");
  holdTracker.commit(context, useHold);
  context.active = PieceType::T;
  context.hold = PieceType::I;
  context.next = {PieceType::S, PieceType::Z, PieceType::J, PieceType::L, PieceType::I};
  context.board.set(39, 0, tetris::Cell::O);
  forecast = holdTracker.observe(context);
  expect(near(forecast.arrival(PieceType::O)[1], 1.0 / 6),
         "empty Hold consumes two queue pieces, not the held piece twice");
  holdTracker.commit(context, useHold);
  context.active = PieceType::S;
  context.hold = PieceType::T;
  context.next = {PieceType::Z, PieceType::J, PieceType::L, PieceType::I, PieceType::O};
  forecast = holdTracker.observe(context);
  expect(near(forecast.arrival(PieceType::T)[1], 1.0 / 5),
         "swapping occupied Hold consumes only one queue piece");

  tetris::BagGenerator bag(42);
  std::vector<PieceType> sequence;
  for (int n = 0; n < 110; ++n) sequence.push_back(bag.next());
  tetris::SevenBagTracker history;
  context = {};
  for (int n = 0; n < 100; ++n) {
    context.active = sequence[n];
    context.next.assign(sequence.begin() + n + 1, sequence.begin() + n + 6);
    const auto predicted = history.observe(context);
    expect(predicted.arrival(sequence[n + 6])[1] > 0,
           "bag tracking must never rule out the actual hidden next piece");
    const auto probabilities = predicted.arrival(PieceType::T);
    double sum = 0;
    for (double p : probabilities) sum += p;
    expect(near(sum, 1.0), "arrival probabilities must remain normalized across bag boundaries");
    history.commit(context, {{context.active, 3, 38, 0}, {tetris::Action::HardDrop}, 0.0, 0});
    context.board.set(39, 0, tetris::Cell::O);
  }
  context.next.assign(5, context.active);
  const auto inconsistent = history.observe(context);
  expect(near(inconsistent.arrival(PieceType::T)[1], 1.0 / 7),
         "inconsistent streams must fall back to uncertain bag phase");
}

void testExpertOpeningBook() {
  int starts = 0, tst = 0, pc = 0, mirrors = 0;
  int carriedStarts = 0, tsdPc = 0, ordinaryPc = 0;
  int runtimePc = 0;
  int mountainStarts = 0, mountainTst = 0, mountainPc = 0, mountainTsdPc = 0;
  for (unsigned seed = 1; seed <= 40; ++seed) {
    OpeningReplay replay(seed);
    auto plan = tetris::findExpertOpeningPlan(replay.context);
    if (!plan) continue;
    if (plan->name == "Mountain-2/Hold-stack") {
      ++mountainStarts;
      const bool mirrored = plan->mirrored;
      expect(plan->steps.size() == 6, "Mountain 2 must carry the seventh piece");
      for (const auto& step : plan->steps)
        expect(replay.play(step) == 0, "Mountain 2 first bag must not clear");
      expect(replay.context.hold == (mirrored ? tetris::PieceType::J : tetris::PieceType::L),
             "Mountain 2 must hold L or mirrored J");
      plan = tetris::findExpertOpeningPlan(replay.context, true, mirrored);
      if (plan) {
        expect(plan->name.find("Mountain-2/TST-") == 0,
               "Mountain 2 second bag must use a TST layout");
        const bool pcContinuation = plan->hasContinuation;
        for (const auto& step : plan->steps) replay.play(step);
        expect(replay.triples == 1, "Mountain 2 must replay a genuine TST");
        ++mountainTst;
        const auto pcPlan = pcContinuation
            ? tetris::findExpertOpeningPlan(replay.context, true, mirrored) : std::nullopt;
        if (pcPlan) {
          expect(pcPlan->name.find("Mountain-2/PC-") == 0 && !pcPlan->hasContinuation,
                 "Mountain 2 third bag must finish with a registered PC");
          auto interrupted = replay.context;
          interrupted.garbageQueue = 1;
          expect(!tetris::findExpertOpeningPlan(interrupted, true, mirrored),
                 "incoming garbage must prevent Mountain 2 PC execution");
          interrupted = replay.context;
          interrupted.board.set(0, 0, tetris::Cell::Garbage);
          expect(!tetris::findExpertOpeningPlan(interrupted, true, mirrored),
                 "a changed residual must not match the Mountain 2 PC table");
          for (const auto& step : pcPlan->steps) replay.play(step);
          expect(replay.context.board.empty() && replay.perfects == 1,
                 "Mountain 2 PC must replay to an empty board");
          ++mountainPc;
          mountainTsdPc += replay.doubles > 0;
        }
        OpeningReplay live(seed);
        tetris::ExpertAgent agent(std::chrono::milliseconds(1), {}, 1);
        for (int n = 0; n < 14; ++n) {
          const auto decision = agent.decide(live.context);
          expect(decision && agent.lastOpeningName().find("Mountain-2/") == 0 &&
                 decision->nodesVisited == 0, "Mountain 2 must use precomputed operations");
          live.play(*decision);
        }
        expect(live.triples == 1, "live Mountain 2 must complete TST");
        if (pcPlan) {
          for (std::size_t n = 0; n < pcPlan->steps.size(); ++n) {
            const auto decision = agent.decide(live.context);
            expect(decision && agent.lastOpeningName().find("Mountain-2/PC-") == 0 &&
                   decision->nodesVisited == 0 && !decision->timedOut,
                   "Mountain 2 PC must ignore runtime search budgets");
            live.play(*decision);
          }
          expect(live.perfects == 1 && live.context.board.empty(),
                 "live Mountain 2 must complete its PC");
        }
        expect(agent.decide(live.context) && agent.lastOpeningName().empty(),
               "Mountain 2 must hand off after PC or unsupported continuation");
      }
      continue;
    }
    ++starts;
    mirrors += plan->mirrored;
    const bool carried = plan->name == "Honey-Cup/Hold-stack";
    carriedStarts += carried;
    expect((carried && plan->steps.size() == 6) ||
           (plan->name == "Honey-Cup/stack" && plan->steps.size() == 7),
           "TD opener must start with a complete stack, not a TSD");
    const bool mirrored = plan->mirrored;
    for (const auto& step : plan->steps)
      expect(replay.play(step) == 0, "bag one must stack without clearing");
    if (carried) expect(replay.context.hold == (mirrored ? tetris::PieceType::L : tetris::PieceType::J),
                        "first bag must carry J/L into the second bag");
    // Even a one-node budget must not truncate a registered opening.
    OpeningReplay tiny(seed);
    tetris::ExpertAgent tinyAgent(std::chrono::milliseconds(1), {}, 1);
    const auto tinyDecision = tinyAgent.decide(tiny.context);
    expect(tinyDecision && !tinyAgent.lastOpeningName().empty() &&
           tinyDecision->nodesVisited == 0 && !tinyDecision->timedOut,
           "opening lookup must not consume the search budget");
    plan = tetris::findExpertOpeningPlan(replay.context, true, mirrored);
    if (!plan) continue;
    expect(plan->name.find("Honey-Cup/TST-") == 0 ||
           plan->name.find("Honey-Cup/Hold-TST-") == 0, "bag two must use a TST template");
    for (const auto& step : plan->steps) replay.play(step);
    expect(replay.triples == 1, "bag two must replay a genuine TST");
    ++tst;
    plan = tetris::findExpertOpeningPlan(replay.context, true, mirrored);
    if (!plan) continue;
    expect((plan->name == "TD/TSD-PC" || plan->name.find("Honey-Cup/PC-") == 0) && !plan->hasContinuation,
           "third bag must finish with a verified PC plan");
    for (const auto& step : plan->steps) replay.play(step);
    expect(replay.perfects == 1 && replay.context.board.empty(),
           "PC route must leave an empty board");
    ++pc;
    if (replay.doubles) ++tsdPc;
    else ++ordinaryPc;
    OpeningReplay live(seed);
    tetris::ExpertAgent agent(std::chrono::milliseconds(1), {}, 1);
    for (int i = 0; i < 20; ++i) {
      const auto decision = agent.decide(live.context);
      if (!decision || agent.lastOpeningName().empty()) break;
      expect(decision->nodesVisited == 0 && !decision->timedOut,
             "every opening phase must use the table, even with one node");
      live.play(*decision);
    }
    if (live.triples == 1 && live.perfects == 1) {
      ++runtimePc;
      const auto ordinary = agent.decide(live.context);
      expect(ordinary && agent.lastOpeningName().empty(), "PC must hand off to normal search");
    }
  }
  std::cout << "TD smoke: starts=" << starts << " mirrors=" << mirrors
            << " carried=" << carriedStarts << " TST=" << tst << " PC=" << pc
            << " TSD-PC=" << tsdPc << " ordinary-PC=" << ordinaryPc
            << " runtime-PC=" << runtimePc << '\n';
  std::cout << "Mountain 2 fallback: starts=" << mountainStarts << " TST=" << mountainTst
            << " PC=" << mountainPc << " TSD-PC=" << mountainTsdPc << '\n';
  expect(mountainStarts > 0 && mountainTst > 0, "Mountain 2 must cover unsupported Honey Cup orders");
  expect(mountainPc >= 6 && mountainTsdPc > 0 && mountainTsdPc < mountainPc,
         "Mountain 2 must retain TSD-PC and ordinary PC fallback coverage");
  std::vector<tetris::PieceType> permutation{
      tetris::PieceType::I, tetris::PieceType::O, tetris::PieceType::T,
      tetris::PieceType::S, tetris::PieceType::Z, tetris::PieceType::J, tetris::PieceType::L};
  int mountainDirections[2] = {};
  do {
    tetris::DecisionContext context;
    context.active = permutation.front();
    context.next.assign(permutation.begin() + 1, permutation.begin() + 6);
    const auto first = tetris::findExpertOpeningPlan(context);
    expect(first.has_value(), "Honey Cup plus Mountain 2 must cover every fresh seven-bag order");
    if (first->name == "Mountain-2/Hold-stack") ++mountainDirections[first->mirrored];
  } while (std::next_permutation(permutation.begin(), permutation.end()));
  expect(mountainDirections[0] > 0 && mountainDirections[1] > 0,
         "Mountain 2 fallback must support both orientations");
  expect(carriedStarts > 0 && tsdPc > 0 && ordinaryPc > 0,
         "Honey Cup must support carried J/L, TSD-PC and ordinary PC fallback");
  expect(pc >= 24 && runtimePc == pc,
         "table lookup must preserve PC coverage across legacy/mirrored residuals and tiny budgets");
  expect(starts > 0 && mirrors > 0 && tst > 0 && pc > 0 && runtimePc > 0,
         "TD book must work in both orientations and complete TSD+PC within the runtime budget");
}

void testExpertTdOpeningSafety() {
  // Safety: future bags are not invented, and damage cancels a cached plan.
  OpeningReplay replay(6);
  auto shortNext = replay.context;
  shortNext.next.resize(2);
  expect(!tetris::findExpertOpeningPlan(shortNext), "do not guess invisible bag pieces");
  auto duplicate = replay.context;
  duplicate.next[0] = duplicate.active;
  expect(!tetris::findExpertOpeningPlan(duplicate), "reject inconsistent seven-bag input");
  auto garbage = replay.context;
  garbage.garbageQueue = 1;
  expect(!tetris::findExpertOpeningPlan(garbage), "do not start TD with incoming garbage");
  for (unsigned seed = 1; seed <= 40; ++seed) {
    OpeningReplay interrupted(seed);
    tetris::ExpertAgent agent(std::chrono::milliseconds(50), {}, 150000);
    const auto first = agent.decide(interrupted.context);
    if (!first || agent.lastOpeningName().empty()) continue;
    interrupted.play(*first);
    interrupted.context.garbageQueue = 20;
    const auto fallback = agent.decide(interrupted.context);
    expect(fallback && agent.lastOpeningName().empty(), "lethal incoming garbage must cancel TD");
    return;
  }
  expect(false, "runtime Expert must execute the TD opener within budget");
}

void testExpertOpeningSurvivesSafeGarbage() {
  unsigned fixture = 0;
  for (unsigned seed = 1; seed <= 40 && !fixture; ++seed) {
    OpeningReplay probe(seed);
    auto plan = tetris::findExpertOpeningPlan(probe.context);
    if (!plan) continue;
    const bool mirror = plan->mirrored;
    for (const auto& step : plan->steps) probe.play(step);
    plan = tetris::findExpertOpeningPlan(probe.context, true, mirror);
    if (plan && plan->name.find("TST-") != std::string_view::npos) fixture = seed;
  }
  expect(fixture != 0, "garbage tests need a known TST opener");
  for (int mode = 0; mode < 3; ++mode) {
    OpeningReplay live(fixture);
    tetris::ExpertAgent agent(std::chrono::milliseconds(200), {}, 0);
    for (int n = 0; n < 14; ++n) {
      // Low-stack waiting garbage, a rise just before TST, and incoming
      // garbage on the firing move. TS does NOT cancel any of these lines.
      if (mode == 0 && n == 1) {
        live.context.garbageQueue = 1;
        live.context.garbageGapColumns = {4};
      }
      if (mode == 1 && n == 12)
        live.context.board = tetris::applyPendingGarbage(live.context.board, {2, 7, 4});
      if (mode == 2 && n == 13) {
        live.context.garbageQueue = 2;
        live.context.garbageGapColumns = {1, 8};
      }
      const auto decision = agent.decide(live.context);
      expect(decision && !agent.lastOpeningName().empty(),
             "safe garbage must not discard an executable TST opener");
      live.play(*decision);
      if (live.context.garbageQueue) {
        live.context.board = tetris::applyPendingGarbage(
            live.context.board, live.context.garbageGapColumns);
        live.context.garbageQueue = 0;
        live.context.garbageGapColumns.clear();
      }
    }
    expect(live.triples == 1, "translated operation sequence must still produce a full TST");
    expect(!live.context.board.empty(), "outgoing TST must not erase pending garbage");
    expect(agent.decide(live.context) && agent.lastOpeningName().empty(),
           "under pressure, cash out TST and relinquish the PC plan");
  }
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
  expect(tetris::calculateGarbage(1, std::nullopt, false, false, 0) == 0 &&
             tetris::calculateGarbage(1, std::nullopt, false, false, 1) == 1 &&
             tetris::calculateGarbage(2, std::nullopt, false, false, 2) == 2 &&
             tetris::calculateGarbage(4, std::nullopt, false, true, 3) == 7,
         "REN garbage must match the frontend combo table");
  expect(tetris::calculateGarbage(4, std::nullopt, true, true, 3) == 12,
         "REN bonus must also apply to a perfect clear");
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
    testHardAgentIgnoresBackToBackState();
    testHardBoardStronglyRejectsBuriedHoles();
    testHardBoardAllowsOnlyOneWell();
    testHardBoardPrefersFlatStacking();
    testSimulatorAppliesHoldAndConsumesNext();
    testHardAgentSimulatorDecisionsAreLegal();
    testHardAgentKeepsSoloStackHoleFree();
    testExpertAgentChoosesTetris();
    testExpertTSpinDoublePatternFeatures();
    testExpertRejectsSidePocketBesideSingleWell();
    testExpertKeepsCleanSoloStackFreeOfUnownedHoles();
    testExpertDetectsCellsNoPieceCanFill();
    testExpertOnlyBuildsTSpinSetupsOnCleanBoards();
    testExpertSevenBagTAvailability();
    testExpertSevenBagIAvailability();
    testExpertWellRewardFollowsIAvailability();
    testExpertRecognizesStructuredSplitStacks();
    testExpertPreventsSecondWellBeforeItBecomesDeep();
    testExpertKeepsChosenSplitAttackLaneOpen();
    testExpertSelectsMirroredSplitAttackLanes();
    testExpertPenalizesOverbuiltWellShoulders();
    testExpertWaitsForFourthTetrisRow();
    testExpertPricesWellDemandAgainstVisibleISupply();
    testExpertImmediatelyResolvesSecondWellWithI();
    testExpertDoesNotBuryOpenShaft();
    testExpertUsesIToLowerDangerousStructuredStack();
    testExpertEmergencyModeBreaksB2BToLowerHeight();
    testExpertRejectsBuriedTSpinSetups();
    testExpertExecutesReachableTSpinDouble();
    testExpertPreservesReachableTSpinDouble();
    testExpertRecognizesAndExecutesTSpinTriple();
    testExpertEvaluatesDonationUnlocks();
    testExpertDonationTemplates();
    testSevenBagForecast();
    testExpertOpeningBook();
    testExpertTdOpeningSafety();
    testExpertOpeningSurvivesSafeGarbage();
    testExpertWellDistanceFeature();
    testExpertBoardStabilityPenalizesBuriedHoles();
    testExpertAvoidsWastingTWithHold();
    testExpertTreatsZeroLineTSpinAsWastedT();
    testExpertConservesTWithDefaultWeights();
    testExpertSpendsTForRecoveryAndPerfectClear();
    testExpertPricesReplacementTScarcity();
    testExpertPricesSafeTSpinSingleOpportunityCost();
    testExpertPreservesTetrisWellForIncomingI();
    testExpertUsesDirectHardDropForLineLessT();
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
