#include "tetris/agent.hpp"

#include <chrono>
#include <stdexcept>
#include <string>

#include "tetris/expert_agent.hpp"
#include "tetris/hard_agent.hpp"

namespace tetris {

std::string_view EasyAgent::name() const noexcept { return "easy"; }

std::optional<AgentDecision> EasyAgent::decide(const Board& board,
                                               PieceType type,
                                               const std::vector<PieceType>&,
                                               std::optional<PieceType>,
                                               bool,
                                               int spawnX,
                                               int spawnY,
                                               int spawnRotation,
                                               bool) {
  return decideEasy(board, type, spawnX, spawnY, spawnRotation);
}

std::unique_ptr<Agent> createAgent(std::string_view modelName,
                                   std::uint64_t thinkTimeMs) {
  if (modelName == "easy") return std::make_unique<EasyAgent>();
  if (modelName == "hard") {
    return std::make_unique<HardAgent>(
        std::chrono::milliseconds(thinkTimeMs));
  }
  if (modelName == "expert") {
    return std::make_unique<ExpertAgent>(
        std::chrono::milliseconds(thinkTimeMs));
  }
  throw std::invalid_argument("unknown AI model: " + std::string(modelName));
}

const std::vector<std::string_view>& availableAgentNames() {
  static const std::vector<std::string_view> names{"easy", "hard", "expert"};
  return names;
}

}  // namespace tetris
