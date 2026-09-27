#pragma once

#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>
#include <vector>

#include "tetris/agent.hpp"
#include "tetris/seven_bag_forecast.hpp"

namespace tetris {

enum class ExpertMidgameTemplateKind {
  StackingPattern,
  AttackSequence,
  Technique,
};

struct ExpertMidgameTemplate {
  int sourcePage = 0;
  std::string_view name;
  ExpertMidgameTemplateKind kind = ExpertMidgameTemplateKind::Technique;
  // Comma-separated notation from the source index (for example
  // "TSD,TST"). Empty for stacking patterns and techniques whose page does
  // not declare a fixed firing sequence.
  std::string_view attackSequence;
};

inline constexpr std::size_t kExpertMidgameTemplateCount = 71;

// Complete catalog from the source midgame-template index. Geometry and move
// verification are handled by the Expert evaluator; this metadata prevents
// individual named families from silently disappearing during refactors.
[[nodiscard]] const std::array<ExpertMidgameTemplate,
                               kExpertMidgameTemplateCount>&
expertMidgameTemplateCatalog() noexcept;

struct ExpertPatternFeatures {
  // The completed-pattern feature is weighted by the number of lines that
  // would actually clear after inserting the T piece (zero, one, or two).
  int completedTSpinDoubleLines = 0;
  int completedTSpinDoublePatterns = 0;
  // A geometric 100/000/101 roof (or mirror), even before surrounding rows
  // are complete enough to clear. Its cavity is reserved for T only.
  int roofedTSpinDoublePatterns = 0;
  // Fewest empty cells outside the T cavity in its two future clear rows.
  // -1 means that no roofed TSD exists. Seven-bag supply can service a small
  // debt later even when those rows are not complete at roof construction.
  int roofedTSpinDoubleFillDebt = -1;
  int preTSpinDoublePatterns = 0;
  // A 000/101 foundation whose two future clear rows are otherwise filled.
  // Only its roof remains to be built before a real TSD can be fired.
  int actionablePreTSpinDoublePatterns = 0;
  int completedTSpinTriplePatterns = 0;
  // Number of verified continuations after the first attack in a replayable
  // T-Spin sequence. This covers the finite two-to-four attack recipes in the
  // midgame catalog without rewarding an SRS-blocked visual cavity.
  int chainedTSpinPatterns = 0;
  int ownedTSpinHoleCells = 0;
  std::vector<ActivePiece> reachableTSpinSlots;
  std::array<int, 5> wellDistance{};
  // 0-indexed divider column. Columns 1..8 represent every non-edge split
  // from 8-1 through 1-8 stacking.
  int structuredWellColumn = -1;
  int structuredWellDepth = 0;
  int structuredSideRoughness = 0;
  // Best developing non-edge divider, including a one-row valley before it
  // becomes a completed four-row Tetris Well.
  int attackLaneColumn = -1;
  int attackLaneDepth = 0;
  int attackLaneSideRoughness = 0;
  int attackLaneSideExcessRoughness = 0;
  // Squared excess of each immediate Well neighbour above its own block's
  // other columns. Two rows of headroom are allowed for a TSD roof.
  int attackLaneShoulderExcess = 0;
  // Absolute height difference between the two cells immediately beside the
  // planned Well. A difference of at most one is a reusable TSD foundation.
  int attackLaneShoulderDelta = 0;
  int attackLaneOccupiedCells = 0;
  // Depth beyond four rows of an unroofed 000/101 foundation in the selected
  // attack lane. Growing both sides further can make the lid unreachable.
  int unroofedTSpinDoubleBurialDepth = 0;
  // The one selected surface valley which the stack is allowed to develop
  // into an I-piece Well. Other simultaneous valleys are competing Wells.
  int primaryOpenWellColumn = -1;
  int openWellCount = 0;
  int openWellDepthSum = 0;
  int openWellPieceDemand = 0;
  int competingWellUnits = 0;
  // Adjacent low columns evade ordinary one-column Well detection because
  // each low column sees the other as a neighbour. Count those wide trenches
  // separately before they require several scarce pieces to repair. A
  // recognized TSD construction column is exempted by the extractor.
  int twoWideTrenchCount = 0;
  int twoWideTrenchDepthSum = 0;
  // Squared depth beyond three rows of multi-column surface depressions.
  // Includes edge basins; each column is counted only once.
  int wideDepressionUnits = 0;
  int garbageRecoveryShaftDepth = 0;
  // Empty cells below the surface which no collision-free grounded placement
  // of any of the seven pieces in any TS/SRS orientation can occupy.
  int unfillableCavityCells = 0;
};

struct ExpertPieceAvailability {
  // 0 means that the piece is already held; 1 means the head of Next. If the
  // piece is not in the visible queue, the 7-bag maximum interval is used as
  // a conservative estimate and exact is false.
  int movesUntilPiece = 13;
  bool inHold = false;
  bool exact = false;
  // Includes Hold and every occurrence remaining in the visible Next queue.
  // Invisible future bags are deliberately not counted as available supply.
  int visibleCount = 0;
  // Conditional probability of the first unseen occurrence at each distance.
  // Does not grant exact/visible supply for donation or move generation.
  std::array<double, 32> arrivalProbability{};
  bool forecast = false;
};

using ExpertTAvailability = ExpertPieceAvailability;
using ExpertIAvailability = ExpertPieceAvailability;

struct ExpertWeights {
  double boardStabilityMultiplier = 1.6;
  double aggregateHeightPenalty = 0.7959712212147635;
  double holesPenalty = 64.56912613860791;
  double holesQuadraticPenalty = 45.0;
  double coveredHolePenalty = 14.665124928338635;
  double unfillableCavityPenalty = 5000.0;
  double newUnfillableCavityPenalty = 1000000.0;
  double unfillableCavityRecoveryReward = 5000.0;
  // Verified TSD/TST cells (including the TST kick entrance) are intentional.
  // Other newly buried cells are stacking damage, even when a J/L could fit
  // there geometrically after an unlikely tuck.
  double newUnownedHolePenalty = 25000.0;
  double bumpinessPenalty = 0.6736262582190178;
  double rowTransitionsPenalty = 2.2;
  double columnTransitionsPenalty = 1.7;
  double maximumHeightPenalty = 6.9260761886542195;
  double cleanBoardReward = 120.0;
  double wellReward = 40.0;
  double structuredStackReward = 400.0;
  double structuredSideRoughnessPenalty = 20.0;
  double flatSideExcessRoughnessPenalty = 150.0;
  double attackLaneObstructionPenalty = 2000.0;
  double attackLaneShoulderPenalty = 220.0;
  double attackLaneShoulderImbalancePenalty = 700.0;
  double balancedAttackLaneReward = 600.0;
  double competingWellPenalty = 15.0;
  double newCompetingWellPenalty = 40.0;
  // A depth-two trench costs less than a verified TSD setup reward. The
  // quadratic static term still makes long two-column shafts prohibitive.
  double twoWideTrenchPenalty = 300.0;
  double newTwoWideTrenchPenalty = 900.0;
  double wideDepressionPenalty = 100.0;
  double secondWellCreationPenalty = 1000000.0;
  double multipleWellResolutionReward = 6000.0;
  double multipleWellDelayPenalty = 600.0;
  double wellSupplyDeficitPenalty = 300.0;
  double deepWellWithoutImmediateIPenalty = 80.0;
  double wellClearReliefReward = 350.0;
  double wellDemandReliefReward = 800.0;
  double unsupportedWellPenalty = 100.0;
  double waitingWellPenalty = 1.0;
  double readyTSpinDoubleReward = 2176.130766469647;
  double completedTSpinDoublePatternReward = 800.0;
  double completedTSpinDoubleBreakPenalty = 6000.0;
  double preTSpinDoubleReward = 900.0;
  double preTSpinDoubleBreakPenalty = 4000.0;
  double unroofedTSpinDoubleBurialPenalty = 1500.0;
  double readyTSpinTripleReward = 4500.0;
  double completedTSpinTripleBreakPenalty = 6000.0;
  double donationUnlockReward = 3200.0;
  double donationTemplateReward = 1800.0;
  double chainedTSpinTemplateReward = 4200.0;
  double wellDistance0Penalty = 10.0;
  double wellDistance1Penalty = 5.0;
  double wellDistance2Reward = 10.0;
  double wellDistance3Reward = 60.0;
  double wellDistance4Reward = 80.0;
  double dangerQuadraticPenalty = 26.46021948818961;
  double dangerLinearPenalty = 472.1089851422372;
  double topOutPenalty = 8000.0;
  double garbageReward = 1569.9622075883108;
  double lineReward = 90.0;
  double heightReliefReward = 100.0;
  double heightIncreasePenalty = 60.0;
  double newHolePenalty = 150.0;
  double buryHolePenalty = 80.0;
  double holeRecoveryReward = 150.0;
  double garbageCellClearedReward = 40.0;
  double iCashoutDelayPenalty = 3000.0;
  double tSpinMiniReward = 40.0;
  double tSpinSingleReward = 120.0;
  // A T piece is a scarce once-per-bag resource.  Spending it on a safe,
  // isolated TSS can prevent the search from completing a higher-output TSD
  // one or two placements later, even when the immediate TSS scores well.
  double tSpinSingleOpportunityPenalty = 5000.0;
  // A TSS must not consume or obstruct a developing four-row Well when the I
  // piece that cashes it out is already visible a few moves ahead.
  double tSpinSingleBlocksTetrisPenalty = 6000.0;
  double tSpinDoubleReward = 1815.0855564666347;
  double tSpinTripleReward = 2600.0;
  double tetrisReward = 1800.0;
  double tetrisCashoutReward = 3000.0;
  double inefficientThreeLinePenalty = 5000.0;
  double inefficientSmallClearPenalty = 2500.0;
  double perfectClearReward = 4200.0;
  double backToBackContinuationReward = 813.0628762324335;
  double backToBackStartReward = 180.0;
  double backToBackBreakPenalty = 2997.0967507671885;
  // Opportunity cost of spending T without a line-clearing spin. Scaled by
  // replacement distance; reduced for repairs and disabled in emergencies.
  double tWastedPenalty = 400.0;
};

struct ExpertBoardEvaluation {
  double value = 0.0;
  int maximumHeight = 0;
  int reachableTSpinDoublePatterns = 0;
  int roofedTSpinDoublePatterns = 0;
  int roofedTSpinDoubleFillDebt = -1;
  int preTSpinDoublePatterns = 0;
  int actionablePreTSpinDoublePatterns = 0;
  int aggregateHeight = 0;
  int holes = 0;
  int unownedHoleCells = 0;
  int coveredHoleDepth = 0;
  int unfillableCavityCells = 0;
  int garbageCells = 0;
  int attackLaneColumn = -1;
  int attackLaneDepth = 0;
  int attackLaneOccupiedCells = 0;
  int unroofedTSpinDoubleBurialDepth = 0;
  int attackLaneSideRoughness = 0;
  int attackLaneSideExcessRoughness = 0;
  int structuredWellDepth = 0;
  int garbageRecoveryShaftDepth = 0;
  int openWellCount = 0;
  int openWellDepthSum = 0;
  int openWellPieceDemand = 0;
  int competingWellUnits = 0;
  int twoWideTrenchCount = 0;
  int twoWideTrenchDepthSum = 0;
  bool cleanForTSpinSetup = false;
  bool safeToPreserveTSpinSetup = false;
  // No verified T-Spin continuation remains while the stack already has
  // damage that should be repaired before constructing another setup.
  bool tSpinSetupRecoveryMode = false;
  int reachableTSpinTriplePatterns = 0;
  int chainedTSpinPatterns = 0;
  std::vector<ActivePiece> reachableTSpinSlots;
  int donationSetupPieces = -1;
  int attackLaneShoulderExcess = 0;
  int attackLaneShoulderDelta = 0;
  int wideDepressionUnits = 0;
};

// A named local shape with a verified continuation, not merely a silhouette.
// Setup placements are in playable order; the final T is stored separately.
struct ExpertDonationPlan {
  std::string_view name;
  ActivePiece target;
  std::vector<ActivePiece> setup;
  // Optional, supplied non-T repair after the target clear (post-clear coordinates).
  std::optional<ActivePiece> cleanup = std::nullopt;
};

// Two verified attacks stored in firing order. The first T-Spin may clear
// one, two, or three lines; the exposed continuation must be a TSD.
struct ExpertTSpinChainPlan {
  std::string_view name;
  ActivePiece first;
  ActivePiece second;
  int firstLines = 0;
};

struct ExpertTSpinSequenceAttack {
  ActivePiece placement;
  int lines = 0;
  TSpin spin = TSpin::Full;
};

struct ExpertTSpinSequencePlan {
  std::vector<ExpertTSpinSequenceAttack> attacks;
  int attackUnits = 0;
};

// Returns every source-catalog attack recipe compatible with the replayed
// TS/SRS result. FIN and ISO require a Full two-line spin; NEO requires a Mini
// two-line spin. Different constructions with the same result may all match.
[[nodiscard]] std::vector<std::string_view> matchExpertMidgameTemplates(
    const ExpertTSpinSequencePlan& plan);

// Next starts with the next playable piece (include Active when inspecting a
// pre-decision board). Up to three setup placements plus T are considered;
// CC additionally requires a supplied, reachable one-piece post-clear repair.
[[nodiscard]] std::optional<ExpertDonationPlan> findExpertDonationTemplate(
    const Board& board, std::optional<PieceType> hold,
    const std::vector<PieceType>& next, std::size_t nextIndex = 0);
[[nodiscard]] std::optional<ExpertTSpinChainPlan> findExpertTSpinChain(
    const Board& board);
// Finds the strongest fully replayable consecutive T-Spin sequence, including
// TSS/TSD/TST and Mini starts. Four attacks cover every finite sequence in the
// source catalog; repeating xN templates are represented by reaching the cap.
[[nodiscard]] std::optional<ExpertTSpinSequencePlan>
findExpertTSpinSequence(const Board& board, std::size_t maximumAttacks = 4);

// Exposed for deterministic feature tests and benchmark diagnostics. The
// agent itself uses the same extractor in its board evaluation.
[[nodiscard]] ExpertPatternFeatures extractExpertPatternFeatures(
    const Board& board) noexcept;
[[nodiscard]] ExpertTAvailability determineExpertTAvailability(
    std::optional<PieceType> holdPiece,
    const std::vector<PieceType>& nextPieces,
    std::size_t nextIndex = 0) noexcept;
[[nodiscard]] ExpertIAvailability determineExpertIAvailability(
    std::optional<PieceType> holdPiece,
    const std::vector<PieceType>& nextPieces,
    std::size_t nextIndex = 0) noexcept;
[[nodiscard]] ExpertBoardEvaluation evaluateExpertBoard(
    const Board& board, const ExpertWeights& weights = {},
    const ExpertTAvailability& tAvailability = {},
    const ExpertIAvailability& iAvailability = {}) noexcept;

// Number of distinct existing cavity ceiling cells removed by a legal lock.
// Clearing unrelated rows higher in the stack is not excavation progress.
[[nodiscard]] int expertClearedHoleCeilings(
    const Board& board, const ActivePiece& placement) noexcept;

// Diagnostic for a legal grounded donor placement: returns 2 or 3 for a
// newly opened safe TSD/TST, otherwise 0. Availability is AFTER using Hold.
[[nodiscard]] int expertDonationLines(
    const Board& board, const ActivePiece& donor,
    const ExpertTAvailability& remainingT) noexcept;

struct ExpertOpeningPlan {
  std::string_view name;
  bool mirrored = false;
  std::vector<AgentDecision> steps;
  bool hasContinuation = false;
  double expectedContinuationValue = 0.0;
};

// Precomputed Honey Cup stack -> TST (including mirrors) -> TSD/ordinary PC.
// Every placement and spin is replayable. Never guesses a future bag.
[[nodiscard]] std::optional<ExpertOpeningPlan> findExpertOpeningPlan(
    const DecisionContext& context, bool continuation = false,
    bool mirrored = false);

class ExpertAgent final : public Agent {
 public:
  using Agent::decide;

  explicit ExpertAgent(std::chrono::milliseconds thinkTime =
                           std::chrono::milliseconds(50),
                       ExpertWeights weights = {},
                       std::uint64_t maximumNodes = 0);

  [[nodiscard]] std::string_view name() const noexcept override;
  [[nodiscard]] std::optional<AgentDecision> decide(
      const DecisionContext& context) override;
  [[nodiscard]] std::string_view lastOpeningName() const noexcept {
    return lastOpeningName_;
  }
  // Unselected until ordinary search evaluates the current board/queue.
  [[nodiscard]] int attackLaneColumn() const noexcept {
    return attackLaneColumn_;
  }

 private:
  [[nodiscard]] std::optional<AgentDecision> decideImpl(const DecisionContext& context);
  SevenBagTracker bagTracker_;
  SevenBagForecast bagForecast_;
  std::chrono::milliseconds thinkTime_;
  ExpertWeights weights_;
  std::uint64_t maximumNodes_;
  int attackLaneColumn_ = -1;
  // 0: first request, 1: initial stack, 2: book follow-up, 3: ordinary search.
  int openingStage_ = 0;
  bool openingMirrored_ = false;
  std::optional<ExpertOpeningPlan> openingPlan_;
  std::size_t openingStep_ = 0;
  std::optional<Board> openingExpectedBoard_;
  int openingGarbageRows_ = 0;
  bool openingUnderPressure_ = false;
  std::string_view lastOpeningName_;
};

}  // namespace tetris
