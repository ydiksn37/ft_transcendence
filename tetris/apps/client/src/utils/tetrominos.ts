export type TetrominoKey = 0 | 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export const TETROMINOS = {
  0: { shape: [[0]], color: 'transparent' },
  
  I: {
    shape: [
      [0, 'I', 0, 0],
      [0, 'I', 0, 0],
      [0, 'I', 0, 0],
      [0, 'I', 0, 0],
    ],
    color: 'cyan',
  },
  J: {
    shape: [
      [0, 'J', 0],
      [0, 'J', 0],
      ['J', 'J', 0],
    ],
    color: 'blue',
  },
  L: {
    shape: [
      [0, 'L', 0],
      [0, 'L', 0],
      [0, 'L', 'L'],
    ],
    color: 'orange',
  },
  O: {
    shape: [
      ['O', 'O'],
      ['O', 'O'],
    ],
    color: 'yellow',
  },
  S: {
    shape: [
      [0, 'S', 'S'],
      ['S', 'S', 0],
      [0, 0, 0],
    ],
    color: 'green',
  },
  T: {
    shape: [
      [0, 0, 0],
      ['T', 'T', 'T'],
      [0, 'T', 0],
    ],
    color: 'purple',
  },
  Z: {
    shape: [
      ['Z', 'Z', 0],
      [0, 'Z', 'Z'],
      [0, 0, 0],
    ],
    color: 'red',
  },
};

export const randomTetromino = () => {
  const tetrominos = 'IJLOSTZ'; 
  const randTetromino =
    tetrominos[Math.floor(Math.random() * tetrominos.length)];
  
  return TETROMINOS[randTetromino as TetrominoKey];
};
