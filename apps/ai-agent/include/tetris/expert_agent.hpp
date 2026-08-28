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
};

struct ExpertTAvailability {
  // 0 means that T is already held; 1 means the head of Next. If T is not in
  // the visible queue, the 7-bag maximum interval is used as a conservative
  // estimate and exact is false.
  int movesUntilT = 13;
  bool inHold = false;
  bool exact = false;
};

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
  double edgeWellReward = 25.580219709503798;
  double readyTSpinDoubleReward = 2176.130766469647;
  double completedTSpinDoublePatternReward = 800.0;
  double completedTSpinDoubleBreakPenalty = 6000.0;
  double preTSpinDoubleReward = 120.0;
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
  double tSpinMiniReward = 40.0;
  double tSpinSingleReward = 280.0;
  double tSpinDoubleReward = 1815.0855564666347;
  double tSpinTripleReward = 2600.0;
  double perfectClearReward = 4200.0;
  double backToBackContinuationReward = 813.0628762324335;
  double backToBackStartReward = 180.0;
  double backToBackBreakPenalty = 2997.0967507671885;
  double tWastedPenalty = 60.0;
};

struct ExpertBoardEvaluation {
  double value = 0.0;
  int maximumHeight = 0;
  int reachableTSpinDoublePatterns = 0;
};

// Exposed for deterministic feature tests and benchmark diagnostics. The
// agent itself uses the same extractor in its board evaluation.
[[nodiscard]] ExpertPatternFeatures extractExpertPatternFeatures(
    const Board& board) noexcept;
[[nodiscard]] ExpertTAvailability determineExpertTAvailability(
    std::optional<PieceType> holdPiece,
    const std::vector<PieceType>& nextPieces,
    std::size_t nextIndex = 0) noexcept;
[[nodiscard]] ExpertBoardEvaluation evaluateExpertBoard(
    const Board& board, const ExpertWeights& weights = {},
    const ExpertTAvailability& availability = {}) noexcept;

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
};

}  // namespace tetris
