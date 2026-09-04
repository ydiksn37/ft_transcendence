#pragma once

#include <chrono>

#include "tetris/agent.hpp"

namespace tetris {

// Public diagnostics keep Hard's intentionally generic stacking policy
// testable without exposing any of its beam-search implementation.
struct HardBoardEvaluation {
  double value = 0.0;
  int aggregateHeight = 0;
  int maximumHeight = 0;
  int holes = 0;
  int coveredHoleDepth = 0;
  int primaryWellColumn = -1;
  int primaryWellDepth = 0;
  int extraWellCount = 0;
  int extraWellDepth = 0;
  int flatSurfaceRoughness = 0;
  int excessiveSurfaceSteps = 0;
};

[[nodiscard]] HardBoardEvaluation evaluateHardBoard(
    const Board& board) noexcept;

class HardAgent final : public Agent {
 public:
  using Agent::decide;

  explicit HardAgent(std::chrono::milliseconds thinkTime =
                         std::chrono::milliseconds(50));

  [[nodiscard]] std::string_view name() const noexcept override;
  [[nodiscard]] std::optional<AgentDecision> decide(
      const DecisionContext& context) override;

 private:
  std::chrono::milliseconds thinkTime_;
};

}  // namespace tetris
