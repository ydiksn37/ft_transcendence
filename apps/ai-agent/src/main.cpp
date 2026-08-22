#include <cstdint>
#include <iostream>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "tetris/agent.hpp"

namespace {

using json = nlohmann::json;

tetris::Board parseBoard(const json& value) {
  if (!value.is_array() || value.size() != tetris::kBoardRows) {
    throw std::invalid_argument("board must contain exactly 20 rows");
  }

  tetris::Board board;
  for (int row = 0; row < tetris::kBoardRows; ++row) {
    const json& sourceRow = value.at(row);
    if (sourceRow.is_string()) {
      const std::string text = sourceRow.get<std::string>();
      if (text.size() != tetris::kBoardCols) {
        throw std::invalid_argument("each board string must contain 10 cells");
      }
      for (int col = 0; col < tetris::kBoardCols; ++col) {
        board.set(row, col,
                  tetris::cellFromString(std::string(1, text[col])));
      }
      continue;
    }

    if (!sourceRow.is_array() || sourceRow.size() != tetris::kBoardCols) {
      throw std::invalid_argument("each board row must contain 10 cells");
    }
    for (int col = 0; col < tetris::kBoardCols; ++col) {
      const json& cell = sourceRow.at(col);
      board.set(row, col,
                cell.is_null()
                    ? tetris::Cell::Empty
                    : tetris::cellFromString(cell.get<std::string>()));
    }
  }
  return board;
}

std::vector<tetris::PieceType> parseNextPieces(const json& state) {
  std::vector<tetris::PieceType> nextPieces;
  if (!state.contains("next")) return nextPieces;
  if (!state.at("next").is_array()) {
    throw std::invalid_argument("next must be an array of tetromino names");
  }
  for (const json& nextPiece : state.at("next")) {
    nextPieces.push_back(
        tetris::pieceTypeFromString(nextPiece.get<std::string>()));
  }
  return nextPieces;
}

void parseGarbageLine(const json& value, std::vector<int>& gaps) {
  if (value.is_number_integer()) {
    gaps.push_back(value.get<int>());
    return;
  }
  if (value.is_object() && value.contains("hole")) {
    gaps.push_back(value.at("hole").get<int>());
    return;
  }
  throw std::invalid_argument(
      "incomingGarbage entries must be hole integers or objects");
}

void parseIncomingGarbage(const json& state,
                          tetris::DecisionContext& context) {
  context.garbageQueue = state.value("garbageQueue", 0);
  const json* incoming = nullptr;
  if (state.contains("incomingGarbage")) {
    incoming = &state.at("incomingGarbage");
  } else if (state.contains("garbageGapColumns")) {
    incoming = &state.at("garbageGapColumns");
  }
  if (!incoming) return;

  if (incoming->is_array()) {
    for (const json& line : *incoming) {
      parseGarbageLine(line, context.garbageGapColumns);
    }
    if (!state.contains("garbageQueue")) {
      context.garbageQueue =
          static_cast<int>(context.garbageGapColumns.size());
    }
    return;
  }
  if (incoming->is_object()) {
    context.garbageQueue = incoming->value("lines", context.garbageQueue);
    if (incoming->contains("holes")) {
      if (!incoming->at("holes").is_array()) {
        throw std::invalid_argument("incomingGarbage.holes must be an array");
      }
      for (const json& hole : incoming->at("holes")) {
        parseGarbageLine(hole, context.garbageGapColumns);
      }
    }
    return;
  }
  throw std::invalid_argument("incomingGarbage must be an array or object");
}

tetris::DecisionContext parseDecisionContext(const json& request) {
  const json& state = request.contains("state") ? request.at("state") : request;
  if (!state.is_object()) {
    throw std::invalid_argument("state must be an object");
  }

  tetris::DecisionContext context;
  context.board = parseBoard(state.at("board"));
  context.active = tetris::pieceTypeFromString(
      state.at("piece").get<std::string>());
  context.next = parseNextPieces(state);
  if (state.contains("hold") && !state.at("hold").is_null()) {
    context.hold = tetris::pieceTypeFromString(
        state.at("hold").get<std::string>());
  }
  context.canHold = state.value("canHold", true);
  context.combo = state.value("combo", -1);
  if (state.contains("b2b")) {
    context.backToBack = state.at("b2b").is_boolean()
                              ? (state.at("b2b").get<bool>() ? 1 : 0)
                              : state.at("b2b").get<int>();
  } else {
    context.backToBack = state.value("b2bActive", false) ? 1 : 0;
  }
  if (state.contains("spawn")) {
    const json& spawn = state.at("spawn");
    context.spawnX = spawn.value("x", context.spawnX);
    context.spawnY = spawn.value("y", context.spawnY);
    context.spawnRotation = spawn.value("rotation", context.spawnRotation);
  }
  parseIncomingGarbage(state, context);

  const json* opponent = nullptr;
  if (request.contains("opponent")) opponent = &request.at("opponent");
  else if (state.contains("opponent")) opponent = &state.at("opponent");
  if (opponent && opponent->is_object()) {
    context.opponent.available = true;
    if (opponent->contains("board")) {
      context.opponent.board = parseBoard(opponent->at("board"));
    }
    context.opponent.garbageQueue = opponent->value("garbageQueue", 0);
    context.opponent.backToBack = opponent->value("b2b", 0);
    context.opponent.combo = opponent->value("combo", -1);
    context.opponent.attacksSent = opponent->value("attacksSent", 0);
    context.opponent.piecesPlaced = opponent->value("piecesPlaced", 0);
  }
  return context;
}

json makeResponse(const json& request, tetris::Agent& agent) {
  const std::string type = request.at("type").get<std::string>();
  if (type != "decide") {
    throw std::invalid_argument("unsupported message type: " + type);
  }

  const tetris::DecisionContext context = parseDecisionContext(request);
  const auto decision = agent.decide(context);
  json response{{"version", 1}, {"type", "decision"}};
  if (request.contains("requestId")) response["requestId"] = request["requestId"];
  response["inputGarbageQueue"] = context.garbageQueue;
  response["projectedGarbageHoles"] =
      tetris::projectedGarbageGaps(context);
  response["opponentAvailable"] = context.opponent.available;

  if (!decision) {
    response["gameOver"] = true;
    response["actions"] = json::array();
    return response;
  }

  response["gameOver"] = false;
  response["placement"] = {
      {"piece", tetris::toString(decision->placement.type)},
      {"x", decision->placement.x},
      {"y", decision->placement.y},
      {"rotation", decision->placement.rotation},
  };
  response["score"] = decision->score;
  response["linesCleared"] = decision->linesCleared;
  response["completedDepth"] = decision->completedDepth;
  response["nodesVisited"] = decision->nodesVisited;
  response["timedOut"] = decision->timedOut;
  response["actions"] = json::array();
  for (const tetris::Action action : decision->actions) {
    response["actions"].push_back(tetris::toString(action));
  }
  return response;
}

void writeJson(const json& value) {
  std::cout << value.dump() << '\n' << std::flush;
}

}  // namespace

int main(int argc, char** argv) {
  std::string model = "easy";
  std::uint64_t thinkTimeMs = 50;
  try {
    for (int index = 1; index < argc; ++index) {
      const std::string argument = argv[index];
      if (argument == "--help") {
        std::cout
            << "Usage: ai_agent [--model easy|hard|expert] [--think-ms N]\n";
        return 0;
      }
      if (index + 1 >= argc) {
        throw std::invalid_argument("missing value for " + argument);
      }
      const std::string value = argv[++index];
      if (argument == "--model") {
        model = value;
      } else if (argument == "--think-ms") {
        std::size_t parsedLength = 0;
        thinkTimeMs = std::stoull(value, &parsedLength);
        if (parsedLength != value.size() || thinkTimeMs == 0) {
          throw std::invalid_argument("--think-ms must be a positive integer");
        }
      } else {
        throw std::invalid_argument("unknown option: " + argument);
      }
    }
  } catch (const std::exception& error) {
    std::cerr << "error: " << error.what() << '\n';
    return 1;
  }

  std::unique_ptr<tetris::Agent> agent;
  try {
    agent = tetris::createAgent(model, thinkTimeMs);
  } catch (const std::exception& error) {
    std::cerr << "error: " << error.what() << '\n';
    return 1;
  }
  writeJson({{"version", 1},
             {"type", "ready"},
             {"difficulty", agent->name()}});

  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    json request;
    try {
      request = json::parse(line);
      if (request.value("type", "") == "shutdown") break;
      writeJson(makeResponse(request, *agent));
    } catch (const std::exception& error) {
      json response{{"version", 1},
                    {"type", "error"},
                    {"message", error.what()}};
      if (request.is_object() && request.contains("requestId")) {
        response["requestId"] = request["requestId"];
      }
      writeJson(response);
    }
  }
  return 0;
}
