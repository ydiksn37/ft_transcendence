import React, { useCallback } from 'react';
import { Container, Graphics } from '@pixi/react';
import * as PIXI from 'pixi.js';
import Cell from './Cell';
import type { Cell as CellType } from '../utils/gameHelpers';
import type { Player } from '../hooks/usePlayer';

type GameBoardProps = {
  stage: CellType[][];
  player: Player;
  ghostY: number;
};

const CELL_SIZE = 30; 

const GameBoard: React.FC<GameBoardProps> = ({ stage, player, ghostY }) => {
  const drawBackground = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.beginFill(0x222222);
    g.drawRect(0, 60, 300, 600);
    g.endFill();
  }, []);

  return (
    <Container y={0}>
      <Graphics draw={drawBackground} />
      {/* 1. Static stage (merged cells and clear background) */}
      {stage.map((row, y) =>
        row.map((cell, x) => {
          if (y < 2 && cell[1] === 'clear') return null; // Hide grid for top 2 rows
          return (
            <Cell
              key={`stage-${y}-${x}`}
              type={cell[0]}
              status={cell[1]}
              x={x * CELL_SIZE}
              y={y * CELL_SIZE}
              size={CELL_SIZE}
            />
          );
        })
      )}
      
      {/* 2. Ghost piece */}
      {player.tetromino.map((row, y) =>
        row.map((value, x) => {
          if (value === 0 || player.collided || ghostY === player.pos.y) return null;
          return (
            <Cell
              key={`ghost-${y}-${x}`}
              type={value as string}
              status="ghost"
              x={(player.pos.x + x) * CELL_SIZE}
              y={(ghostY + y) * CELL_SIZE}
              size={CELL_SIZE}
            />
          );
        })
      )}

      {/* 3. Active piece */}
      {player.tetromino.map((row, y) =>
        row.map((value, x) => {
          if (value === 0 || player.collided) return null;
          return (
            <Cell
              key={`active-${y}-${x}`}
              type={value as string}
              status="clear"
              x={(player.pos.x + x) * CELL_SIZE}
              y={(player.pos.y + y) * CELL_SIZE}
              size={CELL_SIZE}
            />
          );
        })
      )}
    </Container>
  );
};

export default GameBoard;
