#pragma once

#include <array>
#include <optional>
#include <string_view>
#include <vector>

namespace tetris {

constexpr int kBoardRows = 20;
constexpr int kBoardCols = 10;

enum class PieceType { I, O, T, S, Z, J, L };

enum class Cell { Empty, I, O, T, S, Z, J, L, Garbage };

enum class RotationDirection { Clockwise, CounterClockwise, Rotate180 };

enum class TSpin { Full, Mini };

struct Point {
  int row;
  int col;
};

struct ActivePiece {
  PieceType type;
  int x;
  int y;
  int rotation;

  bool operator==(const ActivePiece& other) const noexcept {
    return type == other.type && x == other.x && y == other.y &&
           rotation == other.rotation;
  }
};

class Board {
 public:
  using Row = std::array<Cell, kBoardCols>;
  using Grid = std::array<Row, kBoardRows>;

  Board();

  [[nodiscard]] Cell at(int row, int col) const;
  void set(int row, int col, Cell value);
  [[nodiscard]] const Grid& cells() const noexcept;
  [[nodiscard]] bool empty() const noexcept;

  bool operator==(const Board& other) const noexcept {
    return cells_ == other.cells_;
  }

 private:
  Grid cells_{};
};

struct ClearResult {
  Board board;
  int linesCleared;
};

[[nodiscard]] std::string_view toString(PieceType type) noexcept;
[[nodiscard]] std::string_view toString(Cell cell) noexcept;
[[nodiscard]] PieceType pieceTypeFromString(std::string_view value);
[[nodiscard]] Cell cellFromString(std::string_view value);
[[nodiscard]] Cell cellForPiece(PieceType type) noexcept;

[[nodiscard]] std::array<Point, 4> getMinoCells(const ActivePiece& piece);
[[nodiscard]] bool isValidPosition(const Board& board,
                                   const ActivePiece& piece) noexcept;
[[nodiscard]] int calcGhostY(const Board& board,
                             const ActivePiece& piece) noexcept;
[[nodiscard]] Board lockMino(const Board& board, const ActivePiece& piece);
[[nodiscard]] ClearResult clearLines(const Board& board);
[[nodiscard]] std::optional<TSpin> detectTSpin(
    const Board& board, const ActivePiece& piece, bool lastMoveWasRotation,
    int lastRotationKickIndex, int linesCleared);
[[nodiscard]] std::optional<ActivePiece> tryRotate(
    const Board& board, const ActivePiece& piece, RotationDirection direction,
    int* kickIndex = nullptr);

// The TypeScript implementation chooses random holes. The C++ worker receives
// the actual hole columns so its local board stays synchronized with the server.
[[nodiscard]] Board addGarbageLines(const Board& board,
                                    const std::vector<int>& gapColumns);

}  // namespace tetris
