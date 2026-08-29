#pragma once

#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>

#include "tetris/agent.hpp"

namespace tetris {

struct ExpertPatternFeatures {
  // The completed-pattern feature is weighted by the number of lines that
  // would actually clear after inserting the T piece (zero, one, or two).
  int completedTSpinDoubleLines = 0;
  int completedTSpinDoublePatterns = 0;
  int preTSpinDoublePatterns = 0;
  std::array<int, 5> wellDistance{};
  // 0-indexed divider column. Columns 3/6 represent 3-6 or 6-3 stacking;
  // columns 4/5 represent 4-5 or 5-4 stacking.
  int structuredWellColumn = -1;
  int structuredWellDepth = 0;
  int structuredSideRoughness = 0;
  // Best developing 6-3/5-4 divider, including a one-row valley before it
  // becomes a completed four-row Tetris Well.
  int attackLaneColumn = -1;
  int attackLaneDepth = 0;
  int attackLaneSideRoughness = 0;
  int attackLaneOccupiedCells = 0;
  // The one central surface valley which the stack is allowed to develop
  // into an I-piece Well. Other simultaneous valleys are competing Wells.
  int primaryOpenWellColumn = -1;
  int openWellCount = 0;
  int openWellDepthSum = 0;
  int openWellPieceDemand = 0;
  int competingWellUnits = 0;
  int garbageRecoveryShaftDepth = 0;
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
};

using ExpertTAvailability = ExpertPieceAvailability;
using ExpertIAvailability = ExpertPieceAvailability;

struct ExpertWeights {
  double boardStabilityMultiplier = 1.6;
  double aggregateHeightPenalty = 0.7959712212147635;
  double holesPenalty = 64.56912613860791;
  double holesQuadraticPenalty = 45.0;
  double coveredHolePenalty = 14.665124928338635;
  double bumpinessPenalty = 0.6736262582190178;
  double rowTransitionsPenalty = 2.2;
  double columnTransitionsPenalty = 1.7;
  double maximumHeightPenalty = 6.9260761886542195;
  double cleanBoardReward = 120.0;
  double wellReward = 11.684005869505752;
  double structuredStackReward = 100.0;
  double structuredSideRoughnessPenalty = 8.0;
  double attackLaneObstructionPenalty = 350.0;
  double competingWellPenalty = 15.0;
  double newCompetingWellPenalty = 40.0;
  double secondWellCreationPenalty = 4000.0;
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
  double preTSpinDoubleReward = 350.0;
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
  double tSpinSingleOpportunityPenalty = 800.0;
  double tSpinDoubleReward = 1815.0855564666347;
  double tSpinTripleReward = 2600.0;
  double tetrisReward = 1800.0;
  double perfectClearReward = 4200.0;
  double backToBackContinuationReward = 813.0628762324335;
  double backToBackStartReward = 180.0;
  double backToBackBreakPenalty = 2997.0967507671885;
  double tWastedPenalty = 180.0;
};

struct ExpertBoardEvaluation {
  double value = 0.0;
  int maximumHeight = 0;
  int reachableTSpinDoublePatterns = 0;
  int preTSpinDoublePatterns = 0;
  int aggregateHeight = 0;
  int holes = 0;
  int coveredHoleDepth = 0;
  int garbageCells = 0;
  int attackLaneColumn = -1;
  int structuredWellDepth = 0;
  int garbageRecoveryShaftDepth = 0;
  int openWellCount = 0;
  int openWellDepthSum = 0;
  int openWellPieceDemand = 0;
  int competingWellUnits = 0;
  bool cleanForTSpinSetup = false;
  bool safeToPreserveTSpinSetup = false;
};

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

 private:
  std::chrono::milliseconds thinkTime_;
  ExpertWeights weights_;
  std::uint64_t maximumNodes_;
  int attackLaneColumn_ = 5;
};

}  // namespace tetris
