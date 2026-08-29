#include "tetris/bag.hpp"

#include <algorithm>

namespace tetris {

BagGenerator::BagGenerator(std::uint32_t seed) : state_(seed) {}

double BagGenerator::nextRandom() noexcept {
  state_ = state_ * 1664525U + 1013904223U;
  return static_cast<double>(state_) / 4294967296.0;
}

void BagGenerator::refill() {
  std::array<PieceType, 7> pieces{
      PieceType::I, PieceType::O, PieceType::T, PieceType::S,
      PieceType::Z, PieceType::J, PieceType::L,
  };
  for (std::size_t index = pieces.size() - 1; index > 0; --index) {
    const auto swapIndex = static_cast<std::size_t>(
        nextRandom() * static_cast<double>(index + 1));
    std::swap(pieces[index], pieces[swapIndex]);
  }
  bag_.assign(pieces.begin(), pieces.end());
}

PieceType BagGenerator::next() {
  if (bag_.empty()) refill();
  const PieceType nextPiece = bag_.back();
  bag_.pop_back();
  return nextPiece;
}

}  // namespace tetris
