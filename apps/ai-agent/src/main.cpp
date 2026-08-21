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

json makeResponse(const json& request, tetris::Agent& agent) {
  const std::string type = request.at("type").get<std::string>();
  if (type != "decide") {
    throw std::invalid_argument("unsupported message type: " + type);
  }

  const tetris::Board board = parseBoard(request.at("board"));
  const tetris::PieceType piece =
      tetris::pieceTypeFromString(request.at("piece").get<std::string>());
  std::vector<tetris::PieceType> nextPieces;
  if (request.contains("next")) {
    if (!request.at("next").is_array()) {
      throw std::invalid_argument("next must be an array of tetromino names");
    }
    for (const json& nextPiece : request.at("next")) {
      nextPieces.push_back(
          tetris::pieceTypeFromString(nextPiece.get<std::string>()));
    }
  }
  std::optional<tetris::PieceType> holdPiece;
  if (request.contains("hold") && !request.at("hold").is_null()) {
    holdPiece = tetris::pieceTypeFromString(
        request.at("hold").get<std::string>());
  }
  const bool canHold = request.value("canHold", true);
  bool backToBackActive = request.value("b2bActive", false);
  if (request.contains("b2b")) {
    backToBackActive = request.at("b2b").is_boolean()
                           ? request.at("b2b").get<bool>()
                           : request.at("b2b").get<int>() > 0;
  }

  int spawnX = 3;
  int spawnY = 0;
  int spawnRotation = 0;
  if (request.contains("spawn")) {
    const json& spawn = request.at("spawn");
    spawnX = spawn.value("x", spawnX);
    spawnY = spawn.value("y", spawnY);
    spawnRotation = spawn.value("rotation", spawnRotation);
  }

  const auto decision = agent.decide(board, piece, nextPieces, holdPiece,
                                     canHold, spawnX, spawnY, spawnRotation,
                                     backToBackActive);
  json response{{"version", 1}, {"type", "decision"}};
  if (request.contains("requestId")) response["requestId"] = request["requestId"];

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
