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
  targetLine?: number;
};

const CELL_SIZE = 30; 

const GameBoard: React.FC<GameBoardProps> = ({ stage, player, ghostY, targetLine }) => {
  const width = stage.length > 0 ? stage[0].length * CELL_SIZE : 300;

  const drawBackground = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.beginFill(0x040010, 0.6);
    g.drawRect(0, 60, width, 600);
    g.endFill();

    g.lineStyle({ width: 1, color: 0x5d5d5d, alpha: 0.4, native: true });
    for (let x = 0; x <= width; x += CELL_SIZE) {
    g.moveTo(x, 60);
    g.lineTo(x, 660);
  }
  for (let y = 60; y <= 660; y += CELL_SIZE) {
    g.moveTo(0, y);
    g.lineTo(width, y);
  }

  }, [width]);

  const drawTargetLine = useCallback((g: PIXI.Graphics) => {
    g.clear();
    if (targetLine === undefined) return;
    
    const yPos = targetLine * CELL_SIZE;
    
    // Draw a dashed red line
    g.lineStyle(2, 0xff3333, 0.8);
    for (let x = 0; x < width; x += 10) {
      g.moveTo(x, yPos);
      g.lineTo(Math.min(x + 5, width), yPos);
    }
  }, [targetLine, width]);

  const drawFrame = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.lineStyle(1.5, 0xF6F7F7, 0.8);
    g.drawRect(1.5, 61.5, width - 3, 597);
  }, [width]);

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
      <Graphics draw={drawTargetLine} />
      <Graphics draw={drawFrame} />
    </Container>
  );
};

export default GameBoard;
