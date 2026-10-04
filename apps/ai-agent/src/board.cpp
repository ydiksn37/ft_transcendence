#include "tetris/board.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>

namespace tetris {
namespace {

using Shape = std::array<Point, 4>;
using Rotations = std::array<Shape, 4>;

constexpr std::array<Rotations, 7> kShapes{{
    // I
    {{{{{1, 0}, {1, 1}, {1, 2}, {1, 3}}},
      {{{0, 2}, {1, 2}, {2, 2}, {3, 2}}},
      {{{2, 0}, {2, 1}, {2, 2}, {2, 3}}},
      {{{0, 1}, {1, 1}, {2, 1}, {3, 1}}}}},
    // O
    {{{{{0, 0}, {0, 1}, {1, 0}, {1, 1}}},
      {{{0, 0}, {0, 1}, {1, 0}, {1, 1}}},
      {{{0, 0}, {0, 1}, {1, 0}, {1, 1}}},
      {{{0, 0}, {0, 1}, {1, 0}, {1, 1}}}}},
    // T
    {{{{{0, 1}, {1, 0}, {1, 1}, {1, 2}}},
      {{{0, 1}, {1, 1}, {1, 2}, {2, 1}}},
      {{{1, 0}, {1, 1}, {1, 2}, {2, 1}}},
      {{{0, 1}, {1, 0}, {1, 1}, {2, 1}}}}},
    // S
    {{{{{0, 1}, {0, 2}, {1, 0}, {1, 1}}},
      {{{0, 1}, {1, 1}, {1, 2}, {2, 2}}},
      {{{1, 1}, {1, 2}, {2, 0}, {2, 1}}},
      {{{0, 0}, {1, 0}, {1, 1}, {2, 1}}}}},
    // Z
    {{{{{0, 0}, {0, 1}, {1, 1}, {1, 2}}},
      {{{0, 2}, {1, 1}, {1, 2}, {2, 1}}},
      {{{1, 0}, {1, 1}, {2, 1}, {2, 2}}},
      {{{0, 1}, {1, 0}, {1, 1}, {2, 0}}}}},
    // J
    {{{{{0, 0}, {1, 0}, {1, 1}, {1, 2}}},
      {{{0, 1}, {0, 2}, {1, 1}, {2, 1}}},
      {{{1, 0}, {1, 1}, {1, 2}, {2, 2}}},
      {{{0, 1}, {1, 1}, {2, 0}, {2, 1}}}}},
    // L
    {{{{{0, 2}, {1, 0}, {1, 1}, {1, 2}}},
      {{{0, 1}, {1, 1}, {2, 1}, {2, 2}}},
      {{{1, 0}, {1, 1}, {1, 2}, {2, 0}}},
      {{{0, 0}, {0, 1}, {1, 1}, {2, 1}}}}},
}};

constexpr int pieceIndex(PieceType type) noexcept {
  return static_cast<int>(type);
}

constexpr int normalizeRotation(int rotation) noexcept {
  const int normalized = rotation % 4;
  return normalized < 0 ? normalized + 4 : normalized;
}

struct Offset {
  int dx;
  int dy;
};

using KickList = std::array<Offset, 6>;

constexpr KickList kDefaultKick{
    {{0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}}};

const KickList& jlstzKicks(int from, int to) {
  static constexpr KickList k01{
      {{0, 0}, {-1, 0}, {-1, -1}, {0, 2}, {-1, 2}, {0, 0}}};
  static constexpr KickList k10{
      {{0, 0}, {1, 0}, {1, 1}, {0, -2}, {1, -2}, {0, 0}}};
  static constexpr KickList k12 = k10;
  static constexpr KickList k21 = k01;
  static constexpr KickList k23{
      {{0, 0}, {1, 0}, {1, -1}, {0, 2}, {1, 2}, {0, 0}}};
  static constexpr KickList k32{
      {{0, 0}, {-1, 0}, {-1, 1}, {0, -2}, {-1, -2}, {0, 0}}};
  static constexpr KickList k30 = k32;
  static constexpr KickList k03 = k23;
  static constexpr KickList k02{
      {{0, 0}, {0, -1}, {1, -1}, {-1, -1}, {1, 0}, {-1, 0}}};
  static constexpr KickList k13{
      {{0, 0}, {1, 0}, {1, -2}, {1, -1}, {0, -2}, {0, -1}}};
  static constexpr KickList k20{
      {{0, 0}, {0, 1}, {-1, 1}, {1, 1}, {-1, 0}, {1, 0}}};
  static constexpr KickList k31{
      {{0, 0}, {-1, 0}, {-1, -2}, {-1, -1}, {0, -2}, {0, -1}}};

  if (from == 0 && to == 1) return k01;
  if (from == 1 && to == 0) return k10;
  if (from == 1 && to == 2) return k12;
  if (from == 2 && to == 1) return k21;
  if (from == 2 && to == 3) return k23;
  if (from == 3 && to == 2) return k32;
  if (from == 3 && to == 0) return k30;
  if (from == 0 && to == 3) return k03;
  if (from == 0 && to == 2) return k02;
  if (from == 1 && to == 3) return k13;
  if (from == 2 && to == 0) return k20;
  if (from == 3 && to == 1) return k31;
  return kDefaultKick;
}

const KickList& iKicks(int from, int to) {
  static constexpr KickList k01{
      {{0, 0}, {-2, 0}, {1, 0}, {-2, 1}, {1, -2}, {0, 0}}};
  static constexpr KickList k10{
      {{0, 0}, {2, 0}, {-1, 0}, {2, -1}, {-1, 2}, {0, 0}}};
  static constexpr KickList k12{
      {{0, 0}, {-1, 0}, {2, 0}, {-1, -2}, {2, 1}, {0, 0}}};
  static constexpr KickList k21{
      {{0, 0}, {1, 0}, {-2, 0}, {1, 2}, {-2, -1}, {0, 0}}};
  static constexpr KickList k23 = k10;
  static constexpr KickList k32 = k01;
  static constexpr KickList k30 = k21;
  static constexpr KickList k03 = k12;
  static constexpr KickList k02{
      {{0, 0}, {0, -1}, {1, -1}, {-1, -1}, {1, 0}, {-1, 0}}};
  static constexpr KickList k13{
      {{0, 0}, {1, 0}, {1, -2}, {1, -1}, {0, -2}, {0, -1}}};
  static constexpr KickList k20{
      {{0, 0}, {0, 1}, {-1, 1}, {1, 1}, {-1, 0}, {1, 0}}};
  static constexpr KickList k31{
      {{0, 0}, {-1, 0}, {-1, -2}, {-1, -1}, {0, -2}, {0, -1}}};

  if (from == 0 && to == 1) return k01;
  if (from == 1 && to == 0) return k10;
  if (from == 1 && to == 2) return k12;
  if (from == 2 && to == 1) return k21;
  if (from == 2 && to == 3) return k23;
  if (from == 3 && to == 2) return k32;
  if (from == 3 && to == 0) return k30;
  if (from == 0 && to == 3) return k03;
  if (from == 0 && to == 2) return k02;
  if (from == 1 && to == 3) return k13;
  if (from == 2 && to == 0) return k20;
  if (from == 3 && to == 1) return k31;
  return kDefaultKick;
}

}  // namespace

Board::Board() {
  for (auto& row : cells_) row.fill(Cell::Empty);
}

Cell Board::at(int row, int col) const {
  if (row < 0 || row >= kBoardRows || col < 0 || col >= kBoardCols) {
    throw std::out_of_range("board coordinates are out of range");
  }
  return cells_[row][col];
}

void Board::set(int row, int col, Cell value) {
  if (row < 0 || row >= kBoardRows || col < 0 || col >= kBoardCols) {
    throw std::out_of_range("board coordinates are out of range");
  }
  cells_[row][col] = value;
}

const Board::Grid& Board::cells() const noexcept { return cells_; }

bool Board::empty() const noexcept {
  return std::all_of(cells_.begin(), cells_.end(), [](const Row& row) {
    return std::all_of(row.begin(), row.end(),
                       [](Cell cell) { return cell == Cell::Empty; });
  });
}

std::string_view toString(PieceType type) noexcept {
  static constexpr std::array<std::string_view, 7> kNames{"I", "O", "T", "S", "Z", "J", "L"};
  return kNames[pieceIndex(type)];
}

std::string_view toString(Cell cell) noexcept {
  static constexpr std::array<std::string_view, 9> kNames{
      "EMPTY", "I", "O", "T", "S", "Z", "J", "L", "GARBAGE"};
  return kNames[static_cast<int>(cell)];
}

PieceType pieceTypeFromString(std::string_view value) {
  static constexpr std::array<PieceType, 7> kTypes{
      PieceType::I, PieceType::O, PieceType::T, PieceType::S,
      PieceType::Z, PieceType::J, PieceType::L};
  for (const PieceType type : kTypes) {
    if (toString(type) == value) return type;
  }
  throw std::invalid_argument("unknown tetromino type: " + std::string(value));
}

Cell cellFromString(std::string_view value) {
  if (value == "EMPTY" || value == ".") return Cell::Empty;
  if (value == "GARBAGE" || value == "#") return Cell::Garbage;
  return cellForPiece(pieceTypeFromString(value));
}

Cell cellForPiece(PieceType type) noexcept {
  return static_cast<Cell>(static_cast<int>(type) + 1);
}

std::array<Point, 4> getMinoCells(const ActivePiece& piece) {
  const Shape& shape = kShapes[pieceIndex(piece.type)][normalizeRotation(piece.rotation)];
  std::array<Point, 4> result{};
  for (std::size_t index = 0; index < shape.size(); ++index) {
    result[index] = {piece.y + shape[index].row, piece.x + shape[index].col};
  }
  return result;
}

bool isValidPosition(const Board& board, const ActivePiece& piece) noexcept {
  for (const Point cell : getMinoCells(piece)) {
    if (cell.row >= kBoardRows || cell.col < 0 || cell.col >= kBoardCols) {
      return false;
    }
    if (cell.row >= 0 && board.cells()[cell.row][cell.col] != Cell::Empty) {
      return false;
    }
  }
  return true;
}

int calcGhostY(const Board& board, const ActivePiece& piece) noexcept {
  ActivePiece ghost = piece;
  while (true) {
    ActivePiece below = ghost;
    ++below.y;
    if (!isValidPosition(board, below)) return ghost.y;
    ghost = below;
  }
}

Board lockMino(const Board& board, const ActivePiece& piece) {
  Board locked = board;
  for (const Point cell : getMinoCells(piece)) {
    if (cell.row >= 0 && cell.row < kBoardRows && cell.col >= 0 &&
        cell.col < kBoardCols) {
      locked.set(cell.row, cell.col, cellForPiece(piece.type));
    }
  }
  return locked;
}

ClearResult clearLines(const Board& board) {
  Board result;
  int destination = kBoardRows - 1;
  int linesCleared = 0;

  for (int source = kBoardRows - 1; source >= 0; --source) {
    const auto& row = board.cells()[source];
    const bool full = std::none_of(row.begin(), row.end(),
                                   [](Cell cell) { return cell == Cell::Empty; });
    if (full) {
      ++linesCleared;
      continue;
    }
    for (int col = 0; col < kBoardCols; ++col) {
      result.set(destination, col, row[col]);
    }
    --destination;
  }
  return {result, linesCleared};
}

std::optional<TSpin> detectTSpin(const Board& board,
                                 const ActivePiece& piece,
                                 bool lastMoveWasRotation,
                                 int lastRotationKickIndex,
                                 int linesCleared) {
  if (piece.type != PieceType::T || !lastMoveWasRotation) return std::nullopt;

  const std::array<Point, 4> corners{{
      {piece.y, piece.x},
      {piece.y, piece.x + 2},
      {piece.y + 2, piece.x},
      {piece.y + 2, piece.x + 2},
  }};

  int occupied = 0;
  for (const Point corner : corners) {
    if (corner.row < 0 || corner.row >= kBoardRows || corner.col < 0 ||
        corner.col >= kBoardCols ||
        board.cells()[corner.row][corner.col] != Cell::Empty) {
      ++occupied;
    }
  }
  if (occupied < 3) return std::nullopt;

  const auto occupiedAt = [&](int index) {
    const Point corner = corners[static_cast<std::size_t>(index)];
    return corner.row < 0 || corner.row >= kBoardRows || corner.col < 0 ||
           corner.col >= kBoardCols ||
           board.cells()[corner.row][corner.col] != Cell::Empty;
  };
  static constexpr std::array<std::array<int, 2>, 4> kFrontCorners{{
      {{2, 3}}, {{0, 2}}, {{0, 1}}, {{1, 3}},
  }};
  const auto& front = kFrontCorners[normalizeRotation(piece.rotation)];
  const int frontCorners = static_cast<int>(occupiedAt(front[0])) +
                           static_cast<int>(occupiedAt(front[1]));
  return frontCorners == 2 || lastRotationKickIndex == 4 || linesCleared >= 2
             ? TSpin::Full
             : TSpin::Mini;
}

std::optional<ActivePiece> tryRotate(const Board& board,
                                     const ActivePiece& piece,
                                     RotationDirection direction,
                                     int* kickIndex) {
  if (kickIndex != nullptr) *kickIndex = -1;
  if (piece.type == PieceType::O) return std::nullopt;
  const int from = normalizeRotation(piece.rotation);
  int to = from;
  if (direction == RotationDirection::Clockwise) {
    to = (from + 1) % 4;
  } else if (direction == RotationDirection::CounterClockwise) {
    to = (from + 3) % 4;
  } else {
    to = (from + 2) % 4;
  }

  const KickList& kicks = piece.type == PieceType::I ? iKicks(from, to)
                                                      : jlstzKicks(from, to);
  const int attempts = direction == RotationDirection::Rotate180 ? 6 : 5;
  for (int index = 0; index < attempts; ++index) {
    const Offset kick = kicks[index];
    ActivePiece rotated{piece.type, piece.x + kick.dx, piece.y + kick.dy, to};
    if (isValidPosition(board, rotated)) {
      if (kickIndex != nullptr) *kickIndex = index;
      return rotated;
    }
  }
  return std::nullopt;
}

Board addGarbageLines(const Board& board,
                      const std::vector<int>& gapColumns) {
  if (gapColumns.size() > static_cast<std::size_t>(kBoardRows)) {
    throw std::invalid_argument("too many garbage lines");
  }
  for (const int gap : gapColumns) {
    if (gap < 0 || gap >= kBoardCols) {
      throw std::invalid_argument("garbage gap column is out of range");
    }
  }

  Board result;
  const int lines = static_cast<int>(gapColumns.size());
  for (int row = 0; row < kBoardRows - lines; ++row) {
    for (int col = 0; col < kBoardCols; ++col) {
      result.set(row, col, board.cells()[row + lines][col]);
    }
  }
  for (int index = 0; index < lines; ++index) {
    const int row = kBoardRows - lines + index;
    for (int col = 0; col < kBoardCols; ++col) {
      result.set(row, col,
                 col == gapColumns[index] ? Cell::Empty : Cell::Garbage);
    }
  }
  return result;
}

}  // namespace tetris
