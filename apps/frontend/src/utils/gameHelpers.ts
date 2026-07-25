import type { Player } from '../hooks/usePlayer';

export const STAGE_WIDTH = 10;
export const STAGE_HEIGHT = 22;

export type CellStatus = 'clear' | 'merged' | 'ghost';
export type Cell = [string | 0, CellStatus];

export const createStage = (width = 10): Cell[][] =>
  Array.from(Array(STAGE_HEIGHT), () =>
    new Array(width).fill([0, 'clear']) as Cell[]
  );

export const checkCollision = (
  player: Player,
  stage: Cell[][],
  { x: moveX, y: moveY }: { x: number; y: number }
): boolean => {
  for (let y = 0; y < player.tetromino.length; y++) {
    for (let x = 0; x < player.tetromino[y].length; x++) {
      if (player.tetromino[y][x] !== 0) {
        const nextY = y + player.pos.y + moveY;
        const nextX = x + player.pos.x + moveX;

        // Ceiling collision
        if (nextY < 0) return true;

        // Floor collision
        if (nextY >= STAGE_HEIGHT) return true;

        // Wall collision
        if (nextX < 0 || nextX >= stage[0].length) return true;

        // Block collision
        const nextRow = stage[nextY];
        if (nextRow && nextRow[nextX][1] === 'merged') {
          return true;
        }
      }
    }
  }
  return false;
};

/** Find the lowest y position the player can occupy (for ghost piece).
 *  Returns player.pos.y immediately if the tetromino has no filled cells
 *  (prevents infinite loop with the initial empty-piece state).
 */
export const calculateGhostY = (player: Player, stage: Cell[][]): number => {
  // Guard: empty tetromino has no cells to collide
  const hasCells = player.tetromino.some(row => row.some(cell => cell !== 0));
  if (!hasCells) return player.pos.y;

  let ghostY = player.pos.y;
  let limit = STAGE_HEIGHT + 4; // safety upper bound
  while (
    limit-- > 0 &&
    !checkCollision(
      { ...player, pos: { x: player.pos.x, y: ghostY } },
      stage,
      { x: 0, y: 1 }
    )
  ) {
    ghostY++;
  }
  return ghostY;
};
