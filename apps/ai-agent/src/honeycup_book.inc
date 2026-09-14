// Internal to expert_agent.cpp: uses the same deadline and SRS route checker.
struct HoneyDiagram {
  std::string_view name;
  int phase;
  std::vector<std::string> rows;
  PieceType carry = PieceType::J;
  bool continuation = true;
};
#include "honeycup_diagrams.inc"

char honeyMirror(char c) {
  switch (c) {
    case 'j': return 'l'; case 'l': return 'j';
    case 'J': return 'L'; case 'L': return 'J';
    case 's': return 'z'; case 'z': return 's';
    default: return c;
  }
}

PieceType honeyType(char c) {
  switch (c) {
    case 'i': return PieceType::I; case 'o': return PieceType::O;
    case 't': return PieceType::T; case 's': return PieceType::S;
    case 'z': return PieceType::Z; case 'j': case 'J': return PieceType::J;
    case 'l': case 'L': return PieceType::L;
    default: throw std::logic_error("invalid Honey Cup marker");
  }
}

struct HoneyTile { PieceType type; std::vector<Point> cells; };
struct HoneyPattern {
  std::string_view name;
  int phase;
  bool mirrored;
  Board base;
  std::array<std::array<int, kBoardCols>, kBoardRows> owner{};
  std::vector<HoneyTile> tiles;
  PieceType carry = PieceType::J;
  bool continuation = true;
};

const std::vector<HoneyPattern>& honeyPatterns() {
  static const auto patterns = [] {
    std::vector<HoneyPattern> result;
    for (const auto& diagram : kHoneyDiagrams) for (bool mirror : {false, true}) {
      HoneyPattern p;
      p.name = diagram.name;
      p.phase = diagram.phase;
      p.mirrored = mirror;
      p.carry = mirror ? (diagram.carry == PieceType::J ? PieceType::L : PieceType::J) : diagram.carry;
      p.continuation = diagram.phase != 3 && diagram.continuation;
      for (auto& row : p.owner) row.fill(-1);
      std::map<char, int> markers;
      const int top = kBoardRows - static_cast<int>(diagram.rows.size());
      for (int y = 0; y < static_cast<int>(diagram.rows.size()); ++y) {
        if (diagram.rows[y].size() != kBoardCols) throw std::logic_error("invalid Honey Cup width");
        for (int x = 0; x < kBoardCols; ++x) {
          const char c = mirror ? honeyMirror(diagram.rows[y][9 - x]) : diagram.rows[y][x];
          if (c == '-') continue;
          if (c == 'c') {
            p.base.set(top + y, x, Cell::Garbage);
            p.owner[top + y][x] = -2;
            continue;
          }
          if (!markers.count(c)) {
            markers[c] = static_cast<int>(p.tiles.size());
            p.tiles.push_back({honeyType(c), {}});
          }
          const int id = markers[c];
          p.tiles[id].cells.push_back({top + y, x});
          p.owner[top + y][x] = id;
        }
      }
      for (const auto& tile : p.tiles)
        if (tile.cells.size() != 4) throw std::logic_error("invalid Honey Cup tile count");
      result.push_back(std::move(p));
    }
    return result;
  }();
  return patterns;
}

// The diagrams describe placements across line clears. A tile need not form
// a tetromino in the original diagram; it must form one after cleared rows
// have been removed. Never interpret those separated cells as a legal spin.
#ifdef TETRIS_BOOK_GENERATOR
std::vector<ActivePiece> honeyTargets(const HoneyPattern& pattern, unsigned placed, int tile) {
  std::array<bool, kBoardRows> cleared{};
  for (int y = 0; y < kBoardRows; ++y) {
    cleared[y] = std::all_of(pattern.owner[y].begin(), pattern.owner[y].end(), [&](int owner) {
      return owner == -2 || (owner >= 0 && (placed & (1U << owner)));
    });
  }
  auto cells = pattern.tiles[tile].cells;
  for (auto& cell : cells) {
    if (cleared[cell.row]) return {};
    int below = 0;
    for (int y = cell.row + 1; y < kBoardRows; ++y) below += cleared[y];
    cell.row += below;
  }
  std::vector<ActivePiece> targets;
  const auto type = pattern.tiles[tile].type;
  for (int rotation = 0; rotation < 4; ++rotation) {
    const auto offsets = getMinoCells({type, 0, 0, rotation});
    for (const auto offset : offsets) {
      const ActivePiece target{type, cells[0].col - offset.col,
                               cells[0].row - offset.row, rotation};
      const auto actual = getMinoCells(target);
      if (std::all_of(actual.begin(), actual.end(), [&](Point a) {
            return std::any_of(cells.begin(), cells.end(), [&](Point b) {
              return a.row == b.row && a.col == b.col;
            });
          })) { targets.push_back(target); break; }
    }
  }
  return targets;
}

#endif
std::optional<std::vector<PieceType>> honeySupply(const DecisionContext& context, int phase) {
  // At phase 2 Hold belongs to the PREVIOUS bag (there can be two J/L).
  // At phase 3 a held piece, if any, belongs to the new PC bag.
  const bool holdInBag = phase == 3 && context.hold.has_value();
  const std::size_t length = holdInBag ? 6 : 7;
  unsigned seen = holdInBag ? 1U << static_cast<int>(*context.hold) : 0;
  std::vector<PieceType> queue{context.active};
  for (auto type : context.next) {
    if (queue.size() == length) break;
    queue.push_back(type);
  }
  for (auto type : queue) {
    const unsigned bit = 1U << static_cast<int>(type);
    if (seen & bit) return std::nullopt;
    seen |= bit;
  }
  if (queue.size() + static_cast<int>(holdInBag) == 6)
    for (int i = 0; i < 7; ++i) if (!(seen & (1U << i))) queue.push_back(static_cast<PieceType>(i));
  if (queue.size() != length) return std::nullopt;
  return queue;
}

#ifdef TETRIS_BOOK_GENERATOR
std::optional<ExpertOpeningPlan> solveHoneyPattern(
    const HoneyPattern& pattern, const DecisionContext& context, bool requireTsd,
    const SearchLimit& limit, std::uint64_t& nodes, bool& timedOut) {
  const auto supply = honeySupply(context, pattern.phase);
  if (!supply) return std::nullopt;
  const auto& queue = *supply;
  const unsigned all = (1U << pattern.tiles.size()) - 1;
  const auto carry = pattern.carry;
  if (pattern.phase == 2 && context.hold != carry) return std::nullopt;
  std::vector<AgentDecision> path;
  std::set<std::tuple<unsigned, std::size_t, int, bool>> failed;
  // Placement geometry depends on the template/mask, not on bag order.
  static std::map<std::tuple<std::string_view, bool, bool>,
      std::map<std::pair<unsigned, int>, std::optional<AgentDecision>>> cache;
  auto& routes = cache[{pattern.name, pattern.mirrored, requireTsd}];
  const auto solve = [&](auto&& self, const Board& board, unsigned placed, std::size_t index,
                         std::optional<PieceType> hold, bool tsd) -> bool {
    if (searchLimitReached(limit, nodes)) { timedOut = true; return false; }
    ++nodes;
    if (placed == all) {
      if (pattern.phase == 1) return hold == carry;
      if (pattern.phase == 3) return board.empty() && (!requireTsd || tsd);
      return true;
    }
    const auto key = std::make_tuple(placed, index, hold ? static_cast<int>(*hold) : -1, tsd);
    if (failed.count(key)) return false;
    const auto attempt = [&](PieceType type, bool useHold, std::optional<PieceType> afterHold,
                             std::size_t afterIndex) {
      for (int id = 0; id < static_cast<int>(pattern.tiles.size()); ++id) {
        const unsigned bit = 1U << id;
        if ((placed & bit) || pattern.tiles[id].type != type) continue;
        if (pattern.phase == 2 && type == PieceType::T && (placed | bit) != all) continue;
        const auto routeKey = std::make_pair(placed, id);
        auto found = routes.find(routeKey);
        if (found == routes.end()) {
          std::optional<AgentDecision> route;
          for (const auto target : honeyTargets(pattern, placed, id)) {
            if (!isValidPosition(board, target)) continue;
            const int lines = clearLines(lockMino(board, target)).linesCleared;
            const int spin = type == PieceType::T ?
                (pattern.phase == 2 ? 3 : (requireTsd ? 2 : 0)) : 0;
            if (spin && lines != spin) continue;
            route = openingRoute(board, target, limit, nodes, timedOut, spin, pattern.phase == 3);
            if (route || timedOut) break;
          }
          found = routes.emplace(routeKey, std::move(route)).first;
        }
        if (!found->second) continue;
        auto decision = *found->second;
        if (useHold) decision.actions.insert(decision.actions.begin(), Action::Hold);
        const auto after = clearLines(lockMino(board, decision.placement)).board;
        const bool didTsd = requireTsd && type == PieceType::T && decision.linesCleared == 2;
        path.push_back(std::move(decision));
        if (self(self, after, placed | bit, afterIndex, afterHold, tsd || didTsd)) return true;
        path.pop_back();
        if (timedOut) return false;
      }
      return false;
    };
    if (index < queue.size()) {
      if (attempt(queue[index], false, hold, index + 1)) return true;
      if (!path.empty() || context.canHold) {
        if (hold && attempt(*hold, true, queue[index], index + 1)) return true;
        if (!hold && index + 1 < queue.size() &&
            attempt(queue[index + 1], true, queue[index], index + 2)) return true;
      }
    } else if (hold && (!path.empty() || context.canHold)) {
      // Consume the last carried T without predicting the next bag's active.
      if (attempt(*hold, true, std::nullopt, index)) return true;
    }
    failed.insert(key);
    return false;
  };
  if (solve(solve, context.board, 0, 0, context.hold, false))
    return ExpertOpeningPlan{pattern.name, pattern.mirrored, std::move(path), pattern.continuation};
  return std::nullopt;
}

std::optional<ExpertOpeningPlan> planHoneyBook(
    const DecisionContext& context, bool continuation, bool mirrored,
    const SearchLimit& limit, std::uint64_t& nodes, bool& timedOut, bool mountain = false) {
  // Reserve half this budget for ordinary PC when TSD+PC is unavailable.
  for (int pass = 0; pass < 2; ++pass) {
    const SearchLimit passLimit{pass == 0 ? Clock::now() + (limit.deadline - Clock::now()) / 2 : limit.deadline,
        pass == 0 && limit.maximumNodes ? nodes + (limit.maximumNodes - std::min(nodes, limit.maximumNodes)) / 2 : limit.maximumNodes};
    bool passTimedOut = false;
    for (const auto& pattern : honeyPatterns()) {
      if ((pattern.name.find("Mountain-2/") == 0) != mountain) continue;
      if ((pattern.phase != 1) != continuation ||
          (pattern.phase == 2 && pattern.mirrored != mirrored) ||
          (pass == 1 && pattern.phase != 3) || !sameBoardGeometry(context.board, pattern.base)) continue;
      auto plan = solveHoneyPattern(pattern, context, pass == 0 && pattern.phase == 3,
                                   pattern.phase == 3 ? passLimit : limit, nodes, passTimedOut);
      if (plan) return plan;
      if (passTimedOut) break;
    }
    if (searchLimitReached(limit, nodes)) { timedOut = true; return std::nullopt; }
    if (pass == 1) timedOut = passTimedOut;
  }
  return std::nullopt;
}
#endif  // TETRIS_BOOK_GENERATOR
