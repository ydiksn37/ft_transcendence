import React, { useCallback } from 'react';
import { Graphics } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { type TetrominoKey, TETROMINOS } from '../utils/tetrominos';

type CellProps = {
  type: TetrominoKey | string | 0;
  x: number;
  y: number;
  size: number;
};

const colorMap: Record<string, number> = {
  cyan: 0x00FFFF,
  blue: 0x0000FF,
  orange: 0xFFA500,
  yellow: 0xFFFF00,
  green: 0x008000,
  purple: 0x800080,
  red: 0xFF0000,
  transparent: 0x000000,
};

const Cell: React.FC<CellProps> = ({ type, x, y, size }) => {
  const colorName = TETROMINOS[type as TetrominoKey]?.color || 'transparent';
  const hexColor = colorMap[colorName] || 0x000000;
  const isFilled = type !== 0;

  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();

      if (isFilled) {
        g.beginFill(hexColor);
        g.drawRect(0, 0, size, size);
        g.endFill();
      }

      g.lineStyle(1, 0x333333, 1);
      g.drawRect(0, 0, size, size);
    },
    [hexColor, size, isFilled]
  );

  return <Graphics draw={draw} x={x} y={y} />;
};

export default React.memo(Cell);
