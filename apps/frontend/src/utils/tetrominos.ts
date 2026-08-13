export type TetrominoKey = 0 | 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z' | 'X' | 'B';

export const TETROMINOS = {
  0: { shape: [[0]], color: 'transparent' },
  X: { shape: [['X']], color: 'gray' },
  B: { shape: [['B']], color: 'brown' },
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
let prngSeed: number | null = null;
let prngState = 0;

export const setRandomSeed = (seed: number | null): void => {
  prngSeed = seed;
  if (seed !== null) prngState = seed;
};

const nextRandom = (): number => {
  if (prngSeed === null) return Math.random();
  let t = prngState += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const generateBag = (): string[] => {
  const bag = [...TETROMINO_KEYS];
  // Fisher-Yates shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
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
