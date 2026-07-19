export type TetrominoKey = 0 | 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export const TETROMINOS = {
  0: { shape: [[0]], color: 'transparent' },
  
  I: {
    shape: [
      [0, 0, 0, 0],
      ['I', 'I', 'I', 'I'],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: 'cyan',
  },
  J: {
    shape: [
      ['J', 0, 0],
      ['J', 'J', 'J'],
      [0, 0, 0],
    ],
    color: 'blue',
  },
  L: {
    shape: [
      [0, 0, 'L'],
      ['L', 'L', 'L'],
      [0, 0, 0],
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
      [0, 'T', 0],
      ['T', 'T', 'T'],
      [0, 0, 0],
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

let tetrominoBag: string[] = [];

export const resetTetrominoBag = () => {
  tetrominoBag = [];
};

export const randomTetromino = () => {
  if (tetrominoBag.length === 0) {
    const newBag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    
    for (let i = newBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newBag[i], newBag[j]] = [newBag[j], newBag[i]];
    }
    tetrominoBag = newBag;
  }
  
  const randTetromino = tetrominoBag.pop() as keyof typeof TETROMINOS;
  return TETROMINOS[randTetromino];
};
