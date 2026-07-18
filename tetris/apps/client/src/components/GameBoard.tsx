import React from 'react';
import { Container } from '@pixi/react';
import Cell from './Cell';
import type { Cell as CellType } from '../utils/gameHelpers';

type GameBoardProps = {
  stage: CellType[][];
};

const CELL_SIZE = 30; 

const GameBoard: React.FC<GameBoardProps> = ({ stage }) => {
  return (
    <Container>
      {stage.map((row, y) =>
        row.map((cell, x) => (
          <Cell
            key={`${y}-${x}`}
            type={cell[0]}
            x={x * CELL_SIZE}
            y={y * CELL_SIZE}
            size={CELL_SIZE}
          />
        ))
      )}
    </Container>
  );
};

export default GameBoard;
