#pragma once

#include <array>
#include "tetris/decision_context.hpp"
#include "tetris/easy_agent.hpp"

namespace tetris {

// Distribution of the remaining bag AFTER all visible Next entries. This is
// information for evaluation, never a generated queue or executable plan.
struct SevenBagForecast {
  std::array<double, 128> remaining{};
  [[nodiscard]] std::array<double, 32> arrival(PieceType type, int visibleDelay = 0) const;
};

class SevenBagTracker {
 public:
  [[nodiscard]] SevenBagForecast observe(const DecisionContext& context);
  void commit(const DecisionContext& context, const AgentDecision& decision);

 private:
  std::array<double, 128> before_{};
  std::array<double, 128> lastBefore_{};
  std::optional<DecisionContext> last_;
  std::vector<PieceType> expected_;
  std::optional<PieceType> expectedHold_;
  bool initialized_ = false;
};

}  // namespace tetris
