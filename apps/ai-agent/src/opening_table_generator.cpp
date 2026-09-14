// This translation unit builds a bootstrap engine, without the generated table.
#define TETRIS_BOOK_GENERATOR
#include <cstdio>
#include <fstream>
#include <iostream>
#include "expert_agent.cpp"

// Replay every successful table entry, including Hold order, independently
// of the route cache. A corrupt/stale template must fail the build.
void verifyOpening(const tetris::DecisionContext& context,
                   const std::vector<tetris::PieceType>& queue,
                   const tetris::ExpertOpeningPlan& plan) {
  using namespace tetris;
  Board board = context.board;
  auto hold = context.hold;
  std::size_t index = 0;
  for (std::size_t n = 0; n < plan.steps.size(); ++n) {
    const auto& step = plan.steps[n];
    if (step.actions.empty()) throw std::runtime_error("empty opening action list");
    const bool swap = step.actions.front() == Action::Hold;
    if (index >= queue.size() && !(swap && hold && n + 1 == plan.steps.size()))
      throw std::runtime_error("opening guesses an unseen bag");
    // Only a final Hold swap can use an unknown next-bag active. Its type
    // cannot affect the placed piece or the current plan's result.
    auto active = index < queue.size() ? queue[index++] : PieceType::I;
    if (swap) {
      if (n == 0 && !context.canHold) throw std::runtime_error("locked Hold used");
      const auto previous = hold;
      hold = active;
      if (previous) active = *previous;
      else {
        if (index >= queue.size()) throw std::runtime_error("empty Hold guesses supply");
        active = queue[index++];
      }
    }
    ActivePiece piece{active, 3, kSpawnY, 0};
    int kick = -1;
    bool locked = false;
    for (std::size_t a = swap ? 1 : 0; a < step.actions.size(); ++a) {
      if (locked) throw std::runtime_error("action after hard drop");
      const auto action = step.actions[a];
      if (action == Action::HardDrop) {
        const int y = calcGhostY(board, piece);
        if (y != piece.y) kick = -1;
        piece.y = y;
        locked = true;
      } else {
        int nextKick = -1;
        const auto moved = applySearchAction(board, piece, action, &nextKick);
        if (!moved) throw std::runtime_error("illegal opening movement");
        piece = *moved;
        kick = nextKick;
      }
    }
    if (!locked || !(piece == step.placement) || !isValidPosition(board, piece))
      throw std::runtime_error("opening placement mismatch");
    const auto cleared = clearLines(lockMino(board, piece));
    if (cleared.linesCleared != step.linesCleared) throw std::runtime_error("opening clear mismatch");
    if (plan.name.find("TST-") != std::string_view::npos && active == PieceType::T &&
        (cleared.linesCleared != 3 || detectTSpin(board, piece, kick >= 0, kick, 3) != TSpin::Full))
      throw std::runtime_error("opening TST is not a full spin");
    board = cleared.board;
  }
  if (plan.name.find("PC-") != std::string_view::npos && !board.empty())
    throw std::runtime_error("opening PC is not empty");
}

int main(int argc, char** argv) {
  using namespace tetris;
  if (argc != 2) { std::cerr << "usage: ai_opening_table_generator OUTPUT\n"; return 2; }
  try {
    std::map<std::uint64_t, std::size_t> entries;
    std::map<std::vector<unsigned char>, std::size_t> interned;
    std::vector<unsigned char> data;
    const auto& bases = openingTableBases();
    std::size_t examined = 0;
    for (std::size_t id = 0; id < bases.size(); ++id) {
      const auto& base = bases[id];
      for (int held = -1; held < 7; ++held) {
        if (!base.continuation && held != -1) continue;
        if (base.supplyPhase == 2 && held != static_cast<int>(base.carry)) continue;
        std::vector<PieceType> queue;
        for (int p = 0; p < 7; ++p)
          if (base.supplyPhase == 2 || held != p) queue.push_back(static_cast<PieceType>(p));
        do {
          for (bool canHold : {true, false}) {
            DecisionContext context;
            context.board = base.board;
            context.active = queue.front();
            context.next.assign(queue.begin() + 1, queue.end());
            if (held >= 0) context.hold = static_cast<PieceType>(held);
            context.canHold = canHold;
            std::uint64_t nodes = 0;
            bool timedOut = false;
            const auto plan = planOpeningOffline(context, base.continuation, base.mirrored,
                                                 {Deadline::max(), 0}, nodes, timedOut);
            ++examined;
            if (timedOut) throw std::runtime_error("offline search unexpectedly timed out");
            if (!plan) continue;
            verifyOpening(context, queue, *plan);
            std::vector<unsigned char> encoded;
            const auto byte = [&](int value) {
              if (value < 0 || value > 255) throw std::runtime_error("table byte overflow");
              encoded.push_back(static_cast<unsigned char>(value));
            };
            byte(plan->name.size());
            for (char c : plan->name) byte(c);
            byte(plan->mirrored); byte(plan->hasContinuation); byte(plan->steps.size());
            for (const auto& step : plan->steps) {
              byte(static_cast<int>(step.placement.type));
              byte(step.placement.x + 4); byte(step.placement.y + 4);
              byte(step.placement.rotation); byte(step.linesCleared);
              byte(step.actions.size() % 256); byte(step.actions.size() / 256);
              for (auto action : step.actions) byte(static_cast<int>(action));
            }
            const auto [it, inserted] = interned.emplace(encoded, data.size());
            if (inserted) data.insert(data.end(), encoded.begin(), encoded.end());
            entries.emplace(openingTableKey(id, context, queue), it->second);
          }
        } while (std::next_permutation(queue.begin(), queue.end()));
      }
      std::cout << "Opening table: base " << id + 1 << '/' << bases.size()
                << ", " << entries.size() << " plans / " << examined << " cases" << std::endl;
    }
    const std::string temporary = std::string(argv[1]) + ".tmp";
    std::ofstream out(temporary);
    out.exceptions(std::ios::badbit | std::ios::failbit);
    out << "// Generated from templates and the C++ movement rules. Do not edit.\n"
           "static constexpr unsigned char kOpeningData[] = {\n";
    for (std::size_t i = 0; i < data.size(); ++i) {
      out << int(data[i]) << ',';
      if (i % 40 == 39) out << '\n';
    }
    out << "\n};\nstruct OpeningTableEntry { std::uint64_t key; std::size_t offset; };\n"
           "static constexpr OpeningTableEntry kOpeningEntries[] = {\n";
    for (const auto& [key, offset] : entries) out << '{' << key << "ULL," << offset << "},\n";
    out << "};\n";
    out.close();
    if (std::rename(temporary.c_str(), argv[1]) != 0)
      throw std::runtime_error("cannot publish generated opening table");
    std::cout << "Opening table complete: " << interned.size() << " unique plans, "
              << data.size() << " bytes of operation data" << std::endl;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
