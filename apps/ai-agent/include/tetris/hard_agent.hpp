#pragma once

#include <chrono>

#include "tetris/agent.hpp"

namespace tetris {

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
