import {
  Board,
  TetrominoType,
  TETROMINO_SHAPES,
  AiDifficulty,
  AI_BOT_CONFIGS,
} from '@transcendence/shared';
import {
  createEmptyBoard,
  lockMino,
  clearLines,
  isValidPosition,
  BOARD_ROWS,
  BOARD_COLS,
} from './board';

/** 盤面の評価値（低いほど良い） */
function evaluate(board: Board): number {
  let height = 0;
  let holes = 0;
  let bumpiness = 0;
  const colHeights: number[] = [];

  for (let col = 0; col < BOARD_COLS; col++) {
    let topRow = BOARD_ROWS;
    let foundTop = false;
    let colHoles = 0;

    for (let row = 0; row < BOARD_ROWS; row++) {
      if (board[row][col] !== null && !foundTop) {
        topRow = row;
        foundTop = true;
      }
      if (foundTop && board[row][col] === null) colHoles++;
    }

    const colHeight = BOARD_ROWS - topRow;
    colHeights.push(colHeight);
    height += colHeight;
    holes += colHoles;
  }

  for (let col = 0; col < BOARD_COLS - 1; col++) {
    bumpiness += Math.abs(colHeights[col] - colHeights[col + 1]);
  }

  // 重み付き評価
  return height * 0.51 + holes * 0.36 + bumpiness * 0.18;
}

/** ミノの全配置候補を列挙 */
function getBestPlacement(
  board: Board,
  type: TetrominoType,
): { x: number; rotation: 0 | 1 | 2 | 3; score: number } {
  let bestScore = Infinity;
  let bestX = 0;
  let bestRotation: 0 | 1 | 2 | 3 = 0;

  for (let rotation = 0 as 0 | 1 | 2 | 3; rotation < 4; rotation++) {
    for (let x = -2; x < BOARD_COLS + 2; x++) {
      let y = 18;
      if (!isValidPosition(board, type, x, y, rotation)) continue;

      while (isValidPosition(board, type, x, y + 1, rotation)) y++;

      const newBoard = lockMino(board, type, x, y, rotation);
      const { board: cleared } = clearLines(newBoard);
      const score = evaluate(cleared);

      if (score < bestScore) {
        bestScore = score;
        bestX = x;
        bestRotation = rotation;
      }
    }
  }

  return { x: bestX, rotation: bestRotation, score: bestScore };
}

/** AI ボット — 非同期で最善手を返す */
export async function calcAiMove(
  board: Board,
  type: TetrominoType,
  difficulty: AiDifficulty,
): Promise<{ x: number; rotation: 0 | 1 | 2 | 3 }> {
  const config = AI_BOT_CONFIGS[difficulty];

  // 思考遅延
  await new Promise((r) => setTimeout(r, config.thinkDelayMs));

  // ミス確率でランダムな配置をする
  if (Math.random() < config.mistakeRate) {
    const rotation = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
    const validXs: number[] = [];
    for (let x = 0; x < BOARD_COLS; x++) {
      if (isValidPosition(board, type, x, 0, rotation)) validXs.push(x);
    }
    const x = validXs[Math.floor(Math.random() * validXs.length)] ?? 0;
    return { x, rotation };
  }

  return getBestPlacement(board, type);
}
