#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

#include "tetris/board.hpp"

namespace tetris {

/** Seeded 7-bag generator compatible with the TypeScript LCG. */
class BagGenerator {
 public:
  explicit BagGenerator(std::uint32_t seed);

  [[nodiscard]] PieceType next();

 private:
  [[nodiscard]] double nextRandom() noexcept;
  void refill();

  std::vector<PieceType> bag_;
  std::uint32_t state_;
};

}  // namespace tetris
