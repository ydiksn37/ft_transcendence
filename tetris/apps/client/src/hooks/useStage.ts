import { useState, useEffect } from 'react';
import { createStage, calculateGhostY, type Cell } from '../utils/gameHelpers';
import type { Player } from './usePlayer';

export const useStage = (player: Player, resetPlayer: () => void) => {
  const [stage, setStage] = useState<Cell[][]>(createStage());
  const [rowsCleared, setRowsCleared] = useState(0);

  useEffect(() => {
    setRowsCleared(0);

    const sweepRows = (newStage: Cell[][]): Cell[][] =>
      newStage.reduce((acc, row) => {
        if (row.findIndex(cell => cell[0] === 0) === -1) {
          // Full row — remove it and add a blank row at the top
          setRowsCleared(prev => prev + 1);
          acc.unshift(new Array(newStage[0].length).fill([0, 'clear']) as Cell[]);
          return acc;
        }
        acc.push(row);
        return acc;
      }, [] as Cell[][]);

    const updateStage = (prevStage: Cell[][]): Cell[][] => {
      // 1. Keep only 'merged' cells; clear everything else (including ghost)
      const newStage = prevStage.map(row =>
        row.map(cell => (cell[1] === 'merged' ? cell : ([0, 'clear'] as Cell)))
      ) as Cell[][];

      // 2. Draw ghost piece (only when not colliding this frame, and tetromino has actual cells)
      const hasCells = player.tetromino.some(row => row.some(cell => cell !== 0));
      if (!player.collided && hasCells) {
        const ghostY = calculateGhostY(player, newStage);
        // Only draw ghost if it's below the actual piece position
        if (ghostY !== player.pos.y) {
          player.tetromino.forEach((row, y) => {
            row.forEach((value, x) => {
              if (value !== 0) {
                const gY = ghostY + y;
                const gX = player.pos.x + x;
                if (newStage[gY]?.[gX]?.[1] === 'clear') {
                  newStage[gY][gX] = [value, 'ghost'] as Cell;
                }
              }
            });
          });
        }
      }

      // 3. Draw active tetromino on top (overwrites ghost where they overlap)
      player.tetromino.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            const pY = y + player.pos.y;
            const pX = x + player.pos.x;
            if (newStage[pY]?.[pX] !== undefined) {
              newStage[pY][pX] = [
                value,
                player.collided ? 'merged' : 'clear',
              ] as Cell;
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
