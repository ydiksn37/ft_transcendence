#include "tetris/seven_bag_forecast.hpp"

#include <algorithm>
#include <numeric>

namespace tetris {
namespace {
int count(unsigned mask) {
  int n = 0;
  for (; mask; mask &= mask - 1) ++n;
  return n;
}

std::array<double, 128> unknownPhase() {
  std::array<double, 128> result{};
  // Uniform bag phase, uniform subset at that phase. Not uniform over masks.
  constexpr int combinations[] = {1, 7, 21, 35, 35, 21, 7, 1};
  for (unsigned mask = 1; mask < 128; ++mask)
    result[mask] = 1.0 / (7 * combinations[count(mask)]);
  return result;
}

bool consume(std::array<double, 128>& belief, PieceType type) {
  std::array<double, 128> next{};
  const unsigned bit = 1U << static_cast<unsigned>(type);
  for (unsigned i = 0; i < 128; ++i) {
    const unsigned mask = i ? i : 127;
    if (mask & bit) next[mask ^ bit] += belief[i] / count(mask);
  }
  const double total = std::accumulate(next.begin(), next.end(), 0.0);
  if (total == 0) return false;
  for (double& probability : next) probability /= total;
  belief = next;
  return true;
}
}  // namespace

std::array<double, 32> SevenBagForecast::arrival(PieceType type, int delay) const {
  std::array<double, 32> result{};
  const unsigned bit = 1U << static_cast<unsigned>(type);
  for (unsigned i = 0; i < 128; ++i) {
    const unsigned mask = i ? i : 127;
    const int n = count(mask);
    const bool present = (mask & bit) != 0;
    const int slots = present ? n : 7;
    const int offset = delay + (present ? 0 : n);
    for (int j = 1; j <= slots; ++j)
      result[std::clamp(offset + j, 0, 31)] += remaining[i] / slots;
  }
  return result;
}

SevenBagForecast SevenBagTracker::observe(const DecisionContext& context) {
  const bool repeated = last_ && context.board == last_->board &&
      context.active == last_->active && context.hold == last_->hold &&
      context.next == last_->next;
  if (repeated) before_ = lastBefore_;
  else if (!initialized_) {
    before_ = unknownPhase();
    if (context.board.empty() && !context.hold) {
      before_.fill(0);
      before_[127] = 1;
    }
    initialized_ = true;
  } else {
    std::vector<PieceType> visible{context.active};
    visible.insert(visible.end(), context.next.begin(), context.next.end());
    const auto overlap = std::min(visible.size(), expected_.size());
    if (context.hold != expectedHold_ || !std::equal(expected_.begin(),
        expected_.begin() + overlap, visible.begin())) before_ = unknownPhase();
  }
  lastBefore_ = before_;
  last_ = context;
  auto tail = before_;
  bool valid = consume(tail, context.active);
  for (const auto piece : context.next) valid = consume(tail, piece) && valid;
  // Inconsistent/randomizer-mismatched observations must not imply certainty.
  if (!valid) {
    before_ = unknownPhase();
    lastBefore_ = before_;
    tail = before_;
    valid = consume(tail, context.active);
    for (const auto piece : context.next) valid = consume(tail, piece) && valid;
    if (!valid) tail = unknownPhase();
  }
  return {tail};
}

void SevenBagTracker::commit(const DecisionContext& context, const AgentDecision& decision) {
  const bool hold = !decision.actions.empty() && decision.actions.front() == Action::Hold;
  const std::size_t draws = hold && !context.hold ? 2 : 1;
  expected_ = {context.active};
  expected_.insert(expected_.end(), context.next.begin(), context.next.end());
  for (std::size_t i = 0; i < draws && i < expected_.size(); ++i)
    if (!consume(before_, expected_[i])) before_ = unknownPhase();
  expected_.erase(expected_.begin(), expected_.begin() + std::min(draws, expected_.size()));
  expectedHold_ = hold ? std::optional<PieceType>(context.active) : context.hold;
}
}  // namespace tetris
