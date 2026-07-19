import { useState, useEffect } from 'react';
import { createStage, type Cell } from '../utils/gameHelpers';
import type { Player } from './usePlayer';

export const useStage = (player: Player, resetPlayer: () => void) => {
  const [stage, setStage] = useState<Cell[][]>(createStage());
  const [rowsCleared, setRowsCleared] = useState(0);

  useEffect(() => {
    setRowsCleared(0);

    const sweepRows = (newStage: Cell[][]) =>
      newStage.reduce((ack, row) => {
        if (row.findIndex(cell => cell[0] === 0) === -1) {
          setRowsCleared(prev => prev + 1);
          
          ack.unshift(new Array(newStage[0].length).fill([0, 'clear']) as Cell[]);
          return ack;
        }
        ack.push(row);
        return ack;
      }, [] as Cell[][]);

    const updateStage = (prevStage: Cell[][]): Cell[][] => {
      const newStage = prevStage.map(row =>
        row.map(cell => (cell[1] === 'clear' ? [0, 'clear'] : cell))
      ) as Cell[][];

      player.tetromino.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            if (newStage[y + player.pos.y] && newStage[y + player.pos.y][x + player.pos.x]) {
              newStage[y + player.pos.y][x + player.pos.x] = [
                value,
                `${player.collided ? 'merged' : 'clear'}`,
              ];
            }
          }
        });
      });

      if (player.collided) {
        resetPlayer();
        return sweepRows(newStage);
      }

      return newStage;
    };

    setStage(prev => updateStage(prev));
  }, [player, resetPlayer]);

  return [stage, setStage, rowsCleared] as const;
};
