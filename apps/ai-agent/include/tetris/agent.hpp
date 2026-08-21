#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string_view>
#include <vector>

#include "tetris/easy_agent.hpp"

namespace tetris {

class Agent {
 public:
  virtual ~Agent() = default;

  [[nodiscard]] virtual std::string_view name() const noexcept = 0;
  [[nodiscard]] virtual std::optional<AgentDecision> decide(
      const Board& board, PieceType type,
      const std::vector<PieceType>& nextPieces = {},
      std::optional<PieceType> holdPiece = std::nullopt,
      bool canHold = true, int spawnX = 3, int spawnY = 0,
      int spawnRotation = 0, bool backToBackActive = false) = 0;
};

class EasyAgent final : public Agent {
 public:
  [[nodiscard]] std::string_view name() const noexcept override;
  [[nodiscard]] std::optional<AgentDecision> decide(
      const Board& board, PieceType type,
      const std::vector<PieceType>& nextPieces = {},
      std::optional<PieceType> holdPiece = std::nullopt,
      bool canHold = true, int spawnX = 3, int spawnY = 0,
      int spawnRotation = 0, bool backToBackActive = false) override;
};

[[nodiscard]] std::unique_ptr<Agent> createAgent(std::string_view modelName,
                                                 std::uint64_t thinkTimeMs = 50);
[[nodiscard]] const std::vector<std::string_view>& availableAgentNames();

}  // namespace tetris
