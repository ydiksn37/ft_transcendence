import { useState, useEffect, useRef } from 'react';
import { createStage, type Cell } from '../utils/gameHelpers';
import type { Player } from './usePlayer';

export type LockEvent = {
  id: number;
  lines: number;
  tSpinType: 'none' | 't-spin' | 'mini-t-spin';
  perfectClear: boolean;
  lockedX: number;
  lockedY: number;
};

export const useStage = (
  player: Player,
  resetPlayer: (width?: number) => void,
  checkGameOver: (stage: Cell[][], isLockOut?: boolean) => boolean,
  disableSweep: boolean = false
) => {
  const [stage, setStage] = useState<Cell[][]>(createStage());
  const [lockEvent, setLockEvent] = useState<LockEvent | null>(null);
  const lockEventIdRef = useRef(0);
  const stageRef = useRef<Cell[][]>(stage);

  useEffect(() => {
    const sweepRows = (newStage: Cell[][]): { swept: Cell[][]; cleared: number } => {
      let cleared = 0;
      const swept = newStage.reduce((acc, row) => {
        if (row.findIndex(cell => cell[0] === 0) === -1) {
          cleared++;
          acc.unshift(new Array(newStage[0].length).fill([0, 'clear']) as Cell[]);
          return acc;
        }
        acc.push(row);
        return acc;
      }, [] as Cell[][]);
      return { swept, cleared };
    };

    const prevStage = stageRef.current;
    
    // 1. Keep only 'merged' cells; clear everything else (including ghost)
    const newStage = prevStage.map(row =>
      row.map(cell => (cell[1] === 'merged' ? cell : ([0, 'clear'] as Cell)))
    ) as Cell[][];

    // 2. If collided, bake the active piece into the stage
    if (player.collided) {
      let isLockOut = true;
      player.tetromino.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            const pY = y + player.pos.y;
            const pX = x + player.pos.x;
            if (pY >= 18) isLockOut = false;
            if (pY >= 0 && pY < newStage.length && pX >= 0 && pX < newStage[0].length) {
              newStage[pY][pX] = [value, 'merged'] as Cell;
            }
          }
        });
      });
      const { swept, cleared } = disableSweep ? { swept: newStage, cleared: 0 } : sweepRows(newStage);

      let tSpinType: 'none' | 't-spin' | 'mini-t-spin' = 'none';
      if (
        player.tetromino.length === 3 &&
        player.tetromino[1][1] === 'T' &&
        player.lastAction === 'rotate'
      ) {
        const cx = player.pos.x + 1;
        const cy = player.pos.y + 1;
        const corners = [
          { x: cx - 1, y: cy - 1 }, // A
          { x: cx + 1, y: cy - 1 }, // B
          { x: cx - 1, y: cy + 1 }, // C
          { x: cx + 1, y: cy + 1 }, // D
        ];
        
        const isOccupied = (x: number, y: number) => {
          if (x < 0 || x >= newStage[0].length || y >= newStage.length || y < 0) return true;
          return prevStage[y][x][1] === 'merged';
        };
        
        const occupiedCorners = corners.filter(c => isOccupied(c.x, c.y)).length;
        
        if (occupiedCorners >= 3) {
          const rot = player.rotationIndex;
          let flatCorners = 0;
          if (rot === 0) {
             flatCorners = (isOccupied(corners[2].x, corners[2].y) ? 1 : 0) + (isOccupied(corners[3].x, corners[3].y) ? 1 : 0);
          } else if (rot === 1) {
             flatCorners = (isOccupied(corners[0].x, corners[0].y) ? 1 : 0) + (isOccupied(corners[2].x, corners[2].y) ? 1 : 0);
          } else if (rot === 2) {
             flatCorners = (isOccupied(corners[0].x, corners[0].y) ? 1 : 0) + (isOccupied(corners[1].x, corners[1].y) ? 1 : 0);
          } else if (rot === 3) {
             flatCorners = (isOccupied(corners[1].x, corners[1].y) ? 1 : 0) + (isOccupied(corners[3].x, corners[3].y) ? 1 : 0);
          }
          
          if (flatCorners === 2 || player.kickIndex === 4 || cleared >= 2) {
            tSpinType = 't-spin';
          } else {
            tSpinType = 'mini-t-spin';
          }
        }
      }
      let perfectClear = false;
      if (cleared > 0) {
        perfectClear = swept.every(row => row.every(cell => cell[0] === 0));
      }

      stageRef.current = swept;
      setStage(swept);
      
      lockEventIdRef.current++;
      setLockEvent({
        id: lockEventIdRef.current,
        lines: cleared,
        tSpinType,
        perfectClear,
        lockedX: player.pos.x,
        lockedY: player.pos.y
      });
      
      if (!checkGameOver(swept, isLockOut)) {
        resetPlayer(newStage[0].length);
      }
    } else {
      stageRef.current = newStage;
      setStage(newStage);
    }
  }, [player, resetPlayer, checkGameOver]);

  return [stage, setStage, lockEvent, stageRef] as const;
};
