#include <iostream>
#include <stdexcept>
#include <string>

#include <nlohmann/json.hpp>

#include "tetris/easy_agent.hpp"

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

json makeResponse(const json& request) {
  const std::string type = request.at("type").get<std::string>();
  if (type != "decide") {
    throw std::invalid_argument("unsupported message type: " + type);
  }

  const tetris::Board board = parseBoard(request.at("board"));
  const tetris::PieceType piece =
      tetris::pieceTypeFromString(request.at("piece").get<std::string>());

  int spawnX = 3;
  int spawnY = 0;
  int spawnRotation = 0;
  if (request.contains("spawn")) {
    const json& spawn = request.at("spawn");
    spawnX = spawn.value("x", spawnX);
    spawnY = spawn.value("y", spawnY);
    spawnRotation = spawn.value("rotation", spawnRotation);
  }

  const auto decision =
      tetris::decideEasy(board, piece, spawnX, spawnY, spawnRotation);
  json response{{"version", 1}, {"type", "decision"}};
  if (request.contains("requestId")) response["requestId"] = request["requestId"];

  if (!decision) {
    response["gameOver"] = true;
    response["actions"] = json::array();
    return response;
  }

  response["gameOver"] = false;
  response["placement"] = {
      {"x", decision->placement.x},
      {"y", decision->placement.y},
      {"rotation", decision->placement.rotation},
  };
  response["score"] = decision->score;
  response["linesCleared"] = decision->linesCleared;
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

int main() {
  writeJson({{"version", 1}, {"type", "ready"}, {"difficulty", "easy"}});

  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    json request;
    try {
      request = json::parse(line);
      if (request.value("type", "") == "shutdown") break;
      writeJson(makeResponse(request));
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
