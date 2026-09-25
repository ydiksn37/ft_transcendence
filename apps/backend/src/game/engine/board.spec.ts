import {
  createEmptyBoard,
  detectTSpin,
  isValidPosition,
  tryRotate,
} from './board';

describe('frontend-compatible board rules', () => {
  it('uses the frontend I spawn shape and SRS x/y kick coordinates', () => {
    const board = createEmptyBoard();
    expect(isValidPosition(board, 'I', 0, 38, 0)).toBe(true);
    expect(isValidPosition(board, 'I', 0, 39, 0)).toBe(false);

    expect(tryRotate(board, 'I', -2, 1, 1, 'CW')).toEqual({
      x: 0,
      y: 1,
      rotation: 2,
      kickIndex: 2,
    });
    expect(tryRotate(board, 'O', 3, 0, 0, 'CW')).toEqual({
      x: 3,
      y: 0,
      rotation: 1,
      kickIndex: 0,
    });
  });

  it('requires three corners and classifies front corners like the frontend', () => {
    const full = createEmptyBoard();
    full[37][3] = 'GARBAGE';
    full[39][3] = 'GARBAGE';
    full[39][5] = 'GARBAGE';
    expect(detectTSpin(full, 'T', 3, 37, 0, true, 0, 1)).toBe('tspin');

    const mini = createEmptyBoard();
    mini[37][3] = 'GARBAGE';
    mini[37][5] = 'GARBAGE';
    mini[39][3] = 'GARBAGE';
    expect(detectTSpin(mini, 'T', 3, 37, 0, true, 0, 1)).toBe('tspin_mini');
    expect(detectTSpin(mini, 'T', 3, 37, 0, true, 4, 1)).toBe('tspin');
    expect(detectTSpin(mini, 'T', 3, 37, 0, true, 0, 2)).toBe('tspin');

    const twoCorners = createEmptyBoard();
    twoCorners[37][3] = 'GARBAGE';
    twoCorners[39][5] = 'GARBAGE';
    expect(detectTSpin(twoCorners, 'T', 3, 37, 0, true, 0, 1)).toBeNull();
  });
});
