import { useState, useEffect } from 'react';
import { createStage, type Cell } from '../utils/gameHelpers';
import type { Player } from './usePlayer';

export const useStage = (player: Player, resetPlayer: () => void) => {
  const [stage, setStage] = useState<Cell[][]>(createStage());

  useEffect(() => {
    const updateStage = (prevStage: Cell[][]): Cell[][] => {
      const newStage = prevStage.map(row =>
        row.map(cell => (cell[1] === 'clear' ? [0, 'clear'] : cell))
      ) as Cell[][];

      player.tetromino.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            newStage[y + player.pos.y][x + player.pos.x] = [
              value,
              `${player.collided ? 'merged' : 'clear'}`,
            ];
          }
        });
      });

      if (player.collided) {
        resetPlayer();
      }

      return newStage;
    };

    setStage(prev => updateStage(prev));
  }, [player, resetPlayer]);

  return [stage, setStage] as const;
};
