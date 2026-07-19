import type { Player } from '../hooks/usePlayer';

export const STAGE_WIDTH = 10;
export const STAGE_HEIGHT = 20;

export type CellStatus = 'clear' | 'merged' | 'ghost';
export type Cell = [string | 0, CellStatus];

export const createStage = (): Cell[][] =>
  Array.from(Array(STAGE_HEIGHT), () =>
    new Array(STAGE_WIDTH).fill([0, 'clear']) as Cell[]
  );

/** Collision check: only 'merged' cells block movement (ghost cells are passable). */
export const checkCollision = (
  player: Player,
  stage: Cell[][],
  { x: moveX, y: moveY }: { x: number; y: number }
): boolean => {
  for (let y = 0; y < player.tetromino.length; y++) {
    for (let x = 0; x < player.tetromino[y].length; x++) {
      if (player.tetromino[y][x] !== 0) {
        const nextRow = stage[y + player.pos.y + moveY];
        if (
          !nextRow ||
          !nextRow[x + player.pos.x + moveX] ||
          nextRow[x + player.pos.x + moveX][1] === 'merged'
        ) {
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
