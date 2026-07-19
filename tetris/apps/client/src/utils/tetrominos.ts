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

const TETROMINO_KEYS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

let tetrominoBag: string[] = [];

const generateBag = (): string[] => {
  const bag = [...TETROMINO_KEYS];
  // Fisher-Yates shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
};

const ensureBag = (count: number): void => {
  while (tetrominoBag.length < count) {
    tetrominoBag.unshift(...generateBag());
  }
};

export const resetTetrominoBag = (): void => {
  tetrominoBag = [];
};

/** Peek at the next N tetromino keys without consuming them. */
export const peekNextTetrominoKeys = (count: number = 3): string[] => {
  ensureBag(count);
  const nextKeys: string[] = [];
  for (let i = 1; i <= count; i++) {
    nextKeys.push(tetrominoBag[tetrominoBag.length - i]);
  }
  return nextKeys;
};

/** Consume and return a random tetromino from the 7-bag. */
export const randomTetromino = () => {
  ensureBag(1);
  const key = tetrominoBag.pop() as keyof typeof TETROMINOS;
  return TETROMINOS[key];
};
