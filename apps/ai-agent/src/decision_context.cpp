#include "tetris/decision_context.hpp"

#include <algorithm>
#include <cstdint>
#include <stdexcept>

namespace tetris {
namespace {

void hashCombine(std::uint64_t& hash, std::uint64_t value) noexcept {
  hash ^= value + 0x9e3779b97f4a7c15ULL + (hash << 6U) + (hash >> 2U);
}

std::uint64_t snapshotSeed(const DecisionContext& context) noexcept {
  std::uint64_t hash = 1469598103934665603ULL;
  for (const Board::Row& row : context.board.cells()) {
    for (const Cell cell : row) {
      hash ^= static_cast<std::uint64_t>(cell) + 1U;
      hash *= 1099511628211ULL;
    }
  }
  hashCombine(hash, static_cast<std::uint64_t>(context.active) + 1U);
  hashCombine(hash, static_cast<std::uint64_t>(context.garbageQueue));
  hashCombine(hash, static_cast<std::uint64_t>(context.backToBack));
  hashCombine(hash, static_cast<std::uint64_t>(context.combo + 1));
  for (const PieceType piece : context.next) {
    hashCombine(hash, static_cast<std::uint64_t>(piece) + 1U);
  }
  if (context.hold) {
    hashCombine(hash, static_cast<std::uint64_t>(*context.hold) + 1U);
  }
  return hash;
}

std::uint64_t nextRandom(std::uint64_t& state) noexcept {
  state ^= state >> 12U;
  state ^= state << 25U;
  state ^= state >> 27U;
  return state * 2685821657736338717ULL;
}

}  // namespace

std::vector<int> projectedGarbageGaps(const DecisionContext& context) {
  if (context.garbageQueue < 0) {
    throw std::invalid_argument("garbageQueue must be non-negative");
  }
  const int lines = std::min(context.garbageQueue, kBoardRows);
  std::vector<int> gaps;
  gaps.reserve(static_cast<std::size_t>(lines));

  for (const int gap : context.garbageGapColumns) {
    if (gap < 0 || gap >= kBoardCols) {
      throw std::invalid_argument("garbage gap column is out of range");
    }
    if (static_cast<int>(gaps.size()) == lines) break;
    gaps.push_back(gap);
  }

  std::uint64_t random = snapshotSeed(context);
  if (random == 0) random = 0x9e3779b97f4a7c15ULL;
  while (static_cast<int>(gaps.size()) < lines) {
    gaps.push_back(static_cast<int>(nextRandom(random) % kBoardCols));
  }
  return gaps;
}

Board applyPendingGarbage(const Board& board,
                          const std::vector<int>& gapColumns) {
  return gapColumns.empty() ? board : addGarbageLines(board, gapColumns);
}

}  // namespace tetris
