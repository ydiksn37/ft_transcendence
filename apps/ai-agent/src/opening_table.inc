// Shared by the build-time compiler and runtime table lookup.
struct OpeningTableBase {
  Board board;
  bool continuation;
  bool mirrored;
  int supplyPhase;
  PieceType carry;
};

const std::vector<OpeningTableBase>& openingTableBases() {
  static const auto bases = [] {
    std::vector<OpeningTableBase> result;
    const auto add = [&](const Board& board, bool continuation, bool mirrored, int phase, PieceType carry) {
      for (const auto& b : result)
        if (b.continuation == continuation && b.mirrored == mirrored &&
            sameBoardGeometry(b.board, board)) return;
      result.push_back({board, continuation, mirrored, phase, carry});
    };
    for (const auto& p : honeyPatterns()) add(p.base, p.phase != 1, p.mirrored, p.phase, p.carry);
    for (const auto& p : openingPatterns()) add(p.base, p.continuation, p.mirrored,
                                               p.continuation ? 3 : 1, PieceType::J);
    return result;
  }();
  return bases;
}

std::uint64_t openingTableKey(std::size_t base, const DecisionContext& context,
                              const std::vector<PieceType>& queue) {
  std::uint64_t key = (base + 1) << 26;
  key |= std::uint64_t(context.canHold) << 25;
  key |= std::uint64_t(context.hold ? static_cast<int>(*context.hold) + 1 : 0) << 21;
  for (std::size_t i = 0; i < queue.size(); ++i)
    key |= std::uint64_t(static_cast<int>(queue[i]) + 1) << (3 * i);
  return key;
}

#ifndef TETRIS_BOOK_GENERATOR
#include "opening_table_data.inc"

std::optional<ExpertOpeningPlan> planOpening(
    const DecisionContext& context, bool continuation, bool mirrored) {
  if (context.garbageQueue > 0 || !context.garbageGapColumns.empty() ||
      context.spawnX != 3 || context.spawnY != kSpawnY || context.spawnRotation != 0 ||
      (!continuation && (!context.board.empty() || context.hold))) return std::nullopt;
  const auto& bases = openingTableBases();
  for (std::size_t id = 0; id < bases.size(); ++id) {
    const auto& base = bases[id];
    // PC geometry decides orientation: legacy and carried-Hold books use
    // opposite mirror labels for the same residual board.
    if (base.continuation != continuation ||
        (continuation && base.supplyPhase != 3 && base.mirrored != mirrored) ||
        !sameBoardGeometry(base.board, context.board)) continue;
    const auto supply = honeySupply(context, base.supplyPhase);
    if (!supply) continue;
    const auto key = openingTableKey(id, context, *supply);
    const auto entry = std::lower_bound(std::begin(kOpeningEntries), std::end(kOpeningEntries), key,
        [](const auto& e, std::uint64_t k) { return e.key < k; });
    if (entry == std::end(kOpeningEntries) || entry->key != key) continue;
    auto data = kOpeningData + entry->offset;
    const int nameLength = *data++;
    const std::string_view name(reinterpret_cast<const char*>(data), nameLength);
    data += nameLength;
    ExpertOpeningPlan plan{name, bool(*data++), {}, bool(*data++)};
    const int steps = *data++;
    for (int i = 0; i < steps; ++i) {
      AgentDecision decision{};
      decision.placement.type = static_cast<PieceType>(*data++);
      decision.placement.x = int(*data++) - 4;
      decision.placement.y = int(*data++) - 4;
      decision.placement.rotation = *data++;
      decision.linesCleared = *data++;
      const int low = *data++;
      const int count = low + 256 * int(*data++);
      for (int j = 0; j < count; ++j) decision.actions.push_back(static_cast<Action>(*data++));
      plan.steps.push_back(std::move(decision));
    }
    return plan;
  }
  return std::nullopt;
}
#else
std::optional<ExpertOpeningPlan> planOpening(
    const DecisionContext& context, bool continuation, bool mirrored) {
  std::uint64_t nodes = 0;
  bool timedOut = false;
  return planOpeningOffline(context, continuation, mirrored, {Deadline::max(), 0}, nodes, timedOut);
}
#endif
