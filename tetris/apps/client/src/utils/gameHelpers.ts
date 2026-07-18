import type { Player } from '../hooks/usePlayer';

export const STAGE_WIDTH = 10;
export const STAGE_HEIGHT = 20;

export type Cell = [string | 0, 'clear' | 'merged'];

export const createStage = () => {
  return Array.from(Array(STAGE_HEIGHT), () => {
    return new Array(STAGE_WIDTH).fill([0, 'clear']);
  });
};

export const checkCollision = (
  player: Player,
  stage: any[][],
  { x: moveX, y: moveY }: { x: number; y: number }
) => {
  for (let y = 0; y < player.tetromino.length; y += 1) {
    for (let x = 0; x < player.tetromino[y].length; x += 1) {
      if (player.tetromino[y][x] !== 0) {
        if (
          !stage[y + player.pos.y + moveY] ||
          !stage[y + player.pos.y + moveY][x + player.pos.x + moveX] ||
          stage[y + player.pos.y + moveY][x + player.pos.x + moveX][1] !== 'clear'
        ) {
          return true;
        }
      }
    }
  }
  return false;
};
