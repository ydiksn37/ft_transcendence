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
         "expert must place the opening piece around a 5-4 or 6-3 lane");
  const tetris::Board after =
      tetris::lockMino(tetris::Board{}, decision->placement);
  bool columnFiveOpen = true;
  bool columnSixOpen = true;
  for (int row = 0; row < tetris::kBoardRows; ++row) {
    columnFiveOpen = columnFiveOpen &&
                     after.cells()[row][5] == tetris::Cell::Empty;
    columnSixOpen = columnSixOpen &&
                    after.cells()[row][6] == tetris::Cell::Empty;
  }
  expect(columnFiveOpen || columnSixOpen,
         "ordinary opening pieces must preserve a 5-4 or 6-3 attack lane");
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
    testExpertDetectsCellsNoPieceCanFill();
    testExpertOnlyBuildsTSpinSetupsOnCleanBoards();
    testExpertSevenBagTAvailability();
    testExpertSevenBagIAvailability();
    testExpertWellRewardFollowsIAvailability();
    testExpertRecognizesStructuredSplitStacks();
    testExpertPreventsSecondWellBeforeItBecomesDeep();
    testExpertKeepsChosenSplitAttackLaneOpen();
    testExpertWaitsForFourthTetrisRow();
    testExpertPricesWellDemandAgainstVisibleISupply();
    testExpertImmediatelyResolvesSecondWellWithI();
    testExpertDoesNotBuryOpenShaft();
    testExpertUsesIToLowerDangerousStructuredStack();
    testExpertEmergencyModeBreaksB2BToLowerHeight();
    testExpertRejectsBuriedTSpinSetups();
    testExpertExecutesReachableTSpinDouble();
    testExpertPreservesReachableTSpinDouble();
    testExpertWellDistanceFeature();
    testExpertBoardStabilityPenalizesBuriedHoles();
    testExpertAvoidsWastingTWithHold();
    testExpertTreatsZeroLineTSpinAsWastedT();
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
