import React, { useCallback } from 'react';
import { Graphics } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { type TetrominoKey, TETROMINOS } from '../utils/tetrominos';
import type { CellStatus } from '../utils/gameHelpers';
import { colorMap } from '../lib/minoColors';

type CellProps = {
  skin?: 'NEON' | 'RETRO' | 'MINIMAL';
  type: TetrominoKey | string | 0;
  status: CellStatus;
  x: number;
  y: number;
  size: number;
};

/** Lighten (amt>0) or darken (amt<0) a 0xRRGGBB color for bevel shading. */
const shade = (color: number, amt: number): number => {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + amt));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (color & 0xff) + amt));
  return (r << 16) | (g << 8) | b;
};

const Cell: React.FC<CellProps> = ({ type, status, x, y, size, skin = 'RETRO' }) => {
  const colorName = type === 'X' ? 'gray' : (TETROMINOS[type as TetrominoKey]?.color || 'transparent');
  const hexColor = colorMap[colorName] || 0x888888;
  const isGhost = status === 'ghost';
  const isFilled = type !== 0;

  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();

      if (isFilled) {
        if (isGhost) {
          // Ghost piece: same color but semi-transparent (alpha 0.3)
          g.beginFill(hexColor, 0.2);
          g.drawRect(0, 0, size, size);
          g.endFill();

          g.lineStyle(6, hexColor, 0.06);
          g.drawRect(3, 3, size - 6, size - 6);
          g.lineStyle(4, hexColor, 0.10);
          g.drawRect(2, 2, size - 4, size - 4);
          g.lineStyle(2, hexColor, 0.16);
          g.drawRect(1, 1, size - 2, size - 2);

          g.lineStyle(1, hexColor, 0.75);
          g.drawRect(0, 0, size, size);
        } else if (skin === 'MINIMAL') {
          g.beginFill(hexColor);
          g.drawRect(1, 1, size - 2, size - 2);
          g.endFill();
        } else if (skin === 'NEON') {
          g.beginFill(shade(hexColor, -100));
          g.drawRect(1, 1, size - 2, size - 2);
          g.endFill();
          g.lineStyle(2, hexColor, 1);
          g.drawRect(2, 2, size - 4, size - 4);
        } else {
          // Normal / merged piece: solid
          // g.beginFill(hexColor);
          // g.drawRect(0, 0, size, size);
          // g.endFill();
          const bevel = Math.max(2, size * 0.14);
          const light = shade(hexColor, 55);
          const lightSide = shade(hexColor, 28);
          const dark = shade(hexColor, -70);
          const darkSide = shade(hexColor, -40);

          // base
          g.beginFill(hexColor);
          g.drawRect(0, 0, size, size);
          g.endFill();

          // top (lightest) + left (light) highlight
          g.beginFill(light);
          g.drawPolygon([0, 0, size, 0, size - bevel, bevel, bevel, bevel]);
          g.endFill();
          g.beginFill(lightSide);
          g.drawPolygon([0, 0, bevel, bevel, bevel, size - bevel, 0, size]);
          g.endFill();

          // bottom (darkest) + right (dark) shade
          g.beginFill(dark);
          g.drawPolygon([0, size, bevel, size - bevel, size - bevel, size - bevel, size, size]);
          g.endFill();
          g.beginFill(darkSide);
          g.drawPolygon([size, 0, size, size, size - bevel, size - bevel, size - bevel, bevel]);
          g.endFill();

          // faint top gloss
          g.beginFill(0xffffff, 0.06);
          g.drawRect(bevel, bevel, size - 2 * bevel, (size - 2 * bevel) * 0.5);
          g.endFill();
        }
      }
      
      if (isFilled) {
        g.lineStyle(0.7, 0x000000, isGhost ? 0.15 : 0.25);
        g.drawRect(0, 0, size, size);
      }
    },
    [hexColor, size, isFilled, isGhost, skin]
  );

  return <Graphics draw={draw} x={x} y={y} />;
};

export default React.memo(Cell);
