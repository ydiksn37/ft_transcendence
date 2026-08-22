#include "tetris/agent.hpp"

#include <chrono>
#include <stdexcept>
#include <string>

#include "tetris/expert_agent.hpp"
#include "tetris/hard_agent.hpp"

namespace tetris {

std::string_view EasyAgent::name() const noexcept { return "easy"; }

std::optional<AgentDecision> Agent::decide(
    const Board& board, PieceType type,
    const std::vector<PieceType>& nextPieces,
    std::optional<PieceType> holdPiece, bool canHold, int spawnX,
    int spawnY, int spawnRotation, bool backToBackActive) {
  DecisionContext context;
  context.board = board;
  context.active = type;
  context.next = nextPieces;
  context.hold = holdPiece;
  context.canHold = canHold;
  context.spawnX = spawnX;
  context.spawnY = spawnY;
  context.spawnRotation = spawnRotation;
  context.backToBack = backToBackActive ? 1 : 0;
  return decide(context);
}

std::optional<AgentDecision> EasyAgent::decide(
    const DecisionContext& context) {
  const std::vector<int> garbageGaps = projectedGarbageGaps(context);
  return decideEasy(context.board, context.active, context.spawnX,
                    context.spawnY, context.spawnRotation, garbageGaps);
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
