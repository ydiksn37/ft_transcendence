import type { Graphics } from 'pixi.js';
import { type TetrominoKey, TETROMINOS } from '../utils/tetrominos';
import type { CellStatus } from '../utils/gameHelpers';
import { colorMap } from './minoColors';

export type MinoSkin = 'NEON' | 'RETRO' | 'MINIMAL';

const shade = (color: number, amount: number): number => {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (color & 0xff) + amount));
  return (r << 16) | (g << 8) | b;
};

export const drawCellShape = (
  graphics: Graphics,
  type: TetrominoKey | string | 0,
  status: CellStatus,
  size: number,
  skin: MinoSkin = 'RETRO',
  offsetX = 0,
  offsetY = 0,
) => {
  if (type === 0) return;
  const colorName = type === 'X' ? 'gray' : (TETROMINOS[type as TetrominoKey]?.color || 'transparent');
  const hexColor = colorMap[colorName] || 0x888888;
  const isGhost = status === 'ghost';

  if (isGhost) {
    graphics.beginFill(hexColor, 0.2);
    graphics.drawRect(offsetX, offsetY, size, size);
    graphics.endFill();

    graphics.lineStyle(6, hexColor, 0.06);
    graphics.drawRect(offsetX + 3, offsetY + 3, size - 6, size - 6);
    graphics.lineStyle(4, hexColor, 0.10);
    graphics.drawRect(offsetX + 2, offsetY + 2, size - 4, size - 4);
    graphics.lineStyle(2, hexColor, 0.16);
    graphics.drawRect(offsetX + 1, offsetY + 1, size - 2, size - 2);
    graphics.lineStyle(1, hexColor, 0.75);
    graphics.drawRect(offsetX, offsetY, size, size);
  } else if (skin === 'MINIMAL') {
    graphics.beginFill(hexColor);
    graphics.drawRect(offsetX + 1, offsetY + 1, size - 2, size - 2);
    graphics.endFill();
  } else if (skin === 'NEON') {
    graphics.beginFill(shade(hexColor, -100));
    graphics.drawRect(offsetX + 1, offsetY + 1, size - 2, size - 2);
    graphics.endFill();
    graphics.lineStyle(2, hexColor, 1);
    graphics.drawRect(offsetX + 2, offsetY + 2, size - 4, size - 4);
  } else {
    const bevel = Math.max(2, size * 0.14);
    const light = shade(hexColor, 55);
    const lightSide = shade(hexColor, 28);
    const dark = shade(hexColor, -70);
    const darkSide = shade(hexColor, -40);

    graphics.beginFill(hexColor);
    graphics.drawRect(offsetX, offsetY, size, size);
    graphics.endFill();

    graphics.beginFill(light);
    graphics.drawPolygon([
      offsetX, offsetY,
      offsetX + size, offsetY,
      offsetX + size - bevel, offsetY + bevel,
      offsetX + bevel, offsetY + bevel,
    ]);
    graphics.endFill();
    graphics.beginFill(lightSide);
    graphics.drawPolygon([
      offsetX, offsetY,
      offsetX + bevel, offsetY + bevel,
      offsetX + bevel, offsetY + size - bevel,
      offsetX, offsetY + size,
    ]);
    graphics.endFill();

    graphics.beginFill(dark);
    graphics.drawPolygon([
      offsetX, offsetY + size,
      offsetX + bevel, offsetY + size - bevel,
      offsetX + size - bevel, offsetY + size - bevel,
      offsetX + size, offsetY + size,
    ]);
    graphics.endFill();
    graphics.beginFill(darkSide);
    graphics.drawPolygon([
      offsetX + size, offsetY,
      offsetX + size, offsetY + size,
      offsetX + size - bevel, offsetY + size - bevel,
      offsetX + size - bevel, offsetY + bevel,
    ]);
    graphics.endFill();

    graphics.beginFill(0xffffff, 0.06);
    graphics.drawRect(
      offsetX + bevel,
      offsetY + bevel,
      size - 2 * bevel,
      (size - 2 * bevel) * 0.5,
    );
    graphics.endFill();
  }

  graphics.lineStyle(0.7, 0x000000, isGhost ? 0.15 : 0.25);
  graphics.drawRect(offsetX, offsetY, size, size);
};
