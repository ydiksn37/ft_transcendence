import React, { useCallback } from 'react';
import { Graphics } from '@pixi/react';
import * as PIXI from 'pixi.js';
import type { TetrominoKey } from '../utils/tetrominos';
import type { CellStatus } from '../utils/gameHelpers';
import { drawCellShape, type MinoSkin } from '../lib/drawCellShape';

type CellProps = {
  skin?: MinoSkin;
  type: TetrominoKey | string | 0;
  status: CellStatus;
  x: number;
  y: number;
  size: number;
};

const Cell: React.FC<CellProps> = ({ type, status, x, y, size, skin = 'RETRO' }) => {
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      drawCellShape(g, type, status, size, skin);
    },
    [type, status, size, skin]
  );

  return <Graphics draw={draw} x={x} y={y} />;
};

export default React.memo(Cell);
