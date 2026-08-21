#pragma once

#include <chrono>
#include <cstdint>

#include "tetris/agent.hpp"

namespace tetris {

struct ExpertWeights {
  double aggregateHeightPenalty = 0.7959712212147635;
  double holesPenalty = 64.56912613860791;
  double coveredHolePenalty = 14.665124928338635;
  double bumpinessPenalty = 0.6736262582190178;
  double rowTransitionsPenalty = 2.2;
  double columnTransitionsPenalty = 1.7;
  double maximumHeightPenalty = 6.9260761886542195;
  double wellReward = 11.684005869505752;
  double edgeWellReward = 25.580219709503798;
  double readyTSpinDoubleReward = 2176.130766469647;
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
};

class ExpertAgent final : public Agent {
 public:
  explicit ExpertAgent(std::chrono::milliseconds thinkTime =
                           std::chrono::milliseconds(50),
                       ExpertWeights weights = {},
                       std::uint64_t maximumNodes = 0);

  [[nodiscard]] std::string_view name() const noexcept override;
  [[nodiscard]] std::optional<AgentDecision> decide(
      const Board& board, PieceType type,
      const std::vector<PieceType>& nextPieces = {},
      std::optional<PieceType> holdPiece = std::nullopt,
      bool canHold = true, int spawnX = 3, int spawnY = 0,
      int spawnRotation = 0, bool backToBackActive = false) override;

 private:
  std::chrono::milliseconds thinkTime_;
  ExpertWeights weights_;
  std::uint64_t maximumNodes_;
};

}  // namespace tetris
