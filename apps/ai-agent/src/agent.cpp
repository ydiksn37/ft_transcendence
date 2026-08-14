#include "tetris/agent.hpp"

#include <stdexcept>
#include <string>

namespace tetris {

std::string_view EasyAgent::name() const noexcept { return "easy"; }

std::optional<AgentDecision> EasyAgent::decide(const Board& board,
                                               PieceType type,
                                               int spawnX,
                                               int spawnY,
                                               int spawnRotation) {
  return decideEasy(board, type, spawnX, spawnY, spawnRotation);
}

std::unique_ptr<Agent> createAgent(std::string_view modelName) {
  if (modelName == "easy") return std::make_unique<EasyAgent>();
  throw std::invalid_argument("unknown AI model: " + std::string(modelName));
}

const std::vector<std::string_view>& availableAgentNames() {
  static const std::vector<std::string_view> names{"easy"};
  return names;
}

}  // namespace tetris
