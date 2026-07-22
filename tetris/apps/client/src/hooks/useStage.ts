import { useState, useEffect, useRef } from 'react';
import { createStage, type Cell } from '../utils/gameHelpers';
import type { Player } from './usePlayer';

export const useStage = (
  player: Player,
  resetPlayer: () => void,
  checkGameOver: (stage: Cell[][]) => boolean
) => {
  const [stage, setStage] = useState<Cell[][]>(createStage());
  const [rowsCleared, setRowsCleared] = useState(0);
  const stageRef = useRef<Cell[][]>(stage);

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

    const prevStage = stageRef.current;
    
    // 1. Keep only 'merged' cells; clear everything else (including ghost)
    const newStage = prevStage.map(row =>
      row.map(cell => (cell[1] === 'merged' ? cell : ([0, 'clear'] as Cell)))
    ) as Cell[][];

    // 2. If collided, bake the active piece into the stage
    if (player.collided) {
      player.tetromino.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            const pY = y + player.pos.y;
            const pX = x + player.pos.x;
            if (pY >= 0 && pY < newStage.length && pX >= 0 && pX < newStage[0].length) {
              newStage[pY][pX] = [value, 'merged'] as Cell;
            }
          }
        });
      });
      const sweptStage = sweepRows(newStage);
      stageRef.current = sweptStage;
      setStage(sweptStage);
      if (!checkGameOver(sweptStage)) {
        resetPlayer();
      }
    } else {
      stageRef.current = newStage;
      setStage(newStage);
    }
  }, [player, resetPlayer, checkGameOver]);

  return [stage, setStage, rowsCleared, stageRef] as const;
};
