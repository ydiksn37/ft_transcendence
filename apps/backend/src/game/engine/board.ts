import {
  TetrominoType,
  TETROMINO_SHAPES,
  Board,
  Cell,
  WALL_KICKS_NORMAL,
  WALL_KICKS_I,
} from '@transcendence/shared';

export const BOARD_ROWS = 40;
export const BOARD_COLS = 10;

/** 空の盤面を生成 */
export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
}

/** 盤面をディープコピー */
export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

/** ミノの絶対セル座標を計算 */
export function getMinoCells(
  type: TetrominoType,
  x: number,
  y: number,
  rotation: 0 | 1 | 2 | 3,
): [number, number][] {
  return TETROMINO_SHAPES[type][rotation].map(([dr, dc]) => [y + dr, x + dc]);
}

/** 衝突判定 — true = 衝突なし（配置可能） */
export function isValidPosition(
  board: Board,
  type: TetrominoType,
  x: number,
  y: number,
  rotation: 0 | 1 | 2 | 3,
): boolean {
  const cells = getMinoCells(type, x, y, rotation);
  for (const [row, col] of cells) {
    if (row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) return false;
    if (row >= 0 && board[row][col] !== null) return false;
  }
  return true;
}

/** ゴーストピースのY位置を計算 */
export function calcGhostY(
  board: Board,
  type: TetrominoType,
  x: number,
  y: number,
  rotation: 0 | 1 | 2 | 3,
): number {
  let ghostY = y;
  while (isValidPosition(board, type, x, ghostY + 1, rotation)) ghostY++;
  return ghostY;
}

/** ミノを盤面に固定 */
export function lockMino(
  board: Board,
  type: TetrominoType,
  x: number,
  y: number,
  rotation: 0 | 1 | 2 | 3,
): Board {
  const newBoard = cloneBoard(board);
  const cells = getMinoCells(type, x, y, rotation);
  for (const [row, col] of cells) {
    if (row >= 0 && row < BOARD_ROWS) newBoard[row][col] = type;
  }
  return newBoard;
}

/** ライン消去 — 消去ライン数を返す */
export function clearLines(board: Board): {
  board: Board;
  linesCleared: number;
} {
  const newBoard = board.filter((row) => row.some((cell) => cell === null));
  const linesCleared = BOARD_ROWS - newBoard.length;
  const emptyRows = Array.from({ length: linesCleared }, () =>
    Array(BOARD_COLS).fill(null),
  );
  return { board: [...emptyRows, ...newBoard], linesCleared };
}

/** T-Spin 判定（3-corner rule） */
export function detectTSpin(
  board: Board,
  type: TetrominoType,
  x: number,
  y: number,
  rotation: 0 | 1 | 2 | 3,
  lastMoveWasRotation: boolean,
  kickIndex: number,
  linesCleared: number,
): 'tspin' | 'tspin_mini' | null {
  if (type !== 'T' || !lastMoveWasRotation) return null;

  const corners: [number, number][] = [
    [y, x],
    [y, x + 2],
    [y + 2, x],
    [y + 2, x + 2],
  ];

  const occupied = corners.filter(([r, c]) => {
    return (
      r < 0 ||
      r >= BOARD_ROWS ||
      c < 0 ||
      c >= BOARD_COLS ||
      board[r]?.[c] !== null
    );
  }).length;

  if (occupied < 3) return null;

  const occupiedAt = (index: number): number => {
    const [r, c] = corners[index];
    return r < 0 ||
      r >= BOARD_ROWS ||
      c < 0 ||
      c >= BOARD_COLS ||
      board[r]?.[c] !== null
      ? 1
      : 0;
  };
  const frontCornerIndexes: Record<0 | 1 | 2 | 3, [number, number]> = {
    0: [2, 3],
    1: [0, 2],
    2: [0, 1],
    3: [1, 3],
  };
  const [frontA, frontB] = frontCornerIndexes[rotation];
  const frontCorners = occupiedAt(frontA) + occupiedAt(frontB);

  return frontCorners === 2 || kickIndex === 4 || linesCleared >= 2
    ? 'tspin'
    : 'tspin_mini';
}

/** SRS回転 — 成功した位置を返す、失敗は null */
export function tryRotate(
  board: Board,
  type: TetrominoType,
  x: number,
  y: number,
  currentRotation: 0 | 1 | 2 | 3,
  direction: 'CW' | 'CCW' | '180',
): { x: number; y: number; rotation: 0 | 1 | 2 | 3; kickIndex: number } | null {
  let newRotation: 0 | 1 | 2 | 3;
  if (direction === 'CW')
    newRotation = ((currentRotation + 1) % 4) as 0 | 1 | 2 | 3;
  else if (direction === 'CCW')
    newRotation = ((currentRotation + 3) % 4) as 0 | 1 | 2 | 3;
  else newRotation = ((currentRotation + 2) % 4) as 0 | 1 | 2 | 3;

  if (type === 'O') {
    // O piece doesn't change shape or kick, but the rotation itself is successful
    return { x, y, rotation: newRotation, kickIndex: 0 };
  }

  const kickTable = type === 'I' ? WALL_KICKS_I : WALL_KICKS_NORMAL;
  const kickKey = `${currentRotation}->${newRotation}`;
  const kicks = kickTable[kickKey] ?? [[0, 0]];

  for (let kickIndex = 0; kickIndex < kicks.length; kickIndex++) {
    const [dx, dy] = kicks[kickIndex];
    const newX = x + dx;
    const newY = y + dy;
    if (isValidPosition(board, type, newX, newY, newRotation)) {
      return { x: newX, y: newY, rotation: newRotation, kickIndex };
    }
  }
  return null;
}

/** おじゃまラインを盤面下部に追加 */
export function addGarbageLines(
  board: Board,
  lines: number,
  random: () => number = Math.random,
): Board {
  const newBoard = cloneBoard(board).slice(lines);
  for (let i = 0; i < lines; i++) {
    const gapCol = Math.floor(random() * BOARD_COLS);
    const garbageRow = Array(BOARD_COLS).fill('GARBAGE') as Cell[];
    garbageRow[gapCol] = null;
    newBoard.push(garbageRow);
  }
  return newBoard;
}
