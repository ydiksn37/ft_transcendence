#pragma once

#include <chrono>

#include "tetris/agent.hpp"

namespace tetris {

class HardAgent final : public Agent {
 public:
  explicit HardAgent(std::chrono::milliseconds thinkTime =
                         std::chrono::milliseconds(50));

  [[nodiscard]] std::string_view name() const noexcept override;
  [[nodiscard]] std::optional<AgentDecision> decide(
      const Board& board, PieceType type,
      const std::vector<PieceType>& nextPieces = {},
      std::optional<PieceType> holdPiece = std::nullopt,
      bool canHold = true, int spawnX = 3, int spawnY = 0,
      int spawnRotation = 0, bool backToBackActive = false) override;

 private:
  std::chrono::milliseconds thinkTime_;
};

}  // namespace tetris
