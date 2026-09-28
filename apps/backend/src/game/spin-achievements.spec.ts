import {
  detectOtherSpin,
  TETROMINO_SHAPES,
  type OtherSpin,
} from '@transcendence/shared';
import { createEmptyBoard, getMinoCells } from './engine/board';
import { GameInstance } from './game-instance';

function fixture(piece: OtherSpin) {
  const y = 39 - Math.max(...TETROMINO_SHAPES[piece][0].map(([row]) => row));
  const cells = getMinoCells(piece, 3, y, 0);
  const board = createEmptyBoard();
  for (const row of new Set(cells.map(([row]) => row)))
    board[row].fill('GARBAGE');
  for (const [row, col] of cells) board[row][col] = null;
  const [row, col] = cells.reduce((a, b) => (a[0] < b[0] ? a : b));
  board[row - 1][col] = 'GARBAGE';
  return { board, cells, y };
}

describe('non-T spin achievement detection', () => {
  it.each(['I', 'J', 'L', 'S', 'Z'] as const)(
    'recognizes immobile %s and rejects non-rotation locks',
    (piece) => {
      const { board, cells } = fixture(piece);
      const canOccupy = (row: number, col: number) =>
        row < 40 &&
        col >= 0 &&
        col < 10 &&
        (row < 0 || board[row][col] === null);
      expect(detectOtherSpin(piece, true, cells, canOccupy)).toBe(piece);
      expect(detectOtherSpin(piece, false, cells, canOccupy)).toBeNull();
      expect(detectOtherSpin(piece, true, cells, () => true)).toBeNull();
      expect(detectOtherSpin('T', true, cells, canOccupy)).toBeNull();
      expect(detectOtherSpin('O', true, cells, canOccupy)).toBeNull();
    },
  );

  it.each(['I', 'J', 'L', 'S', 'Z'] as const)(
    'counts a line-clearing %s exactly once in the authoritative match',
    (piece) => {
      const server: any = { to: () => ({ emit: jest.fn() }) };
      const game = new GameInstance('spin-achievement', server, 42);
      game.addPlayer('human', 'user');
      const player = game.getPlayers().get('human')!;
      const { board, y } = fixture(piece);
      Object.assign(player, {
        board,
        activeMino: piece,
        activeX: 3,
        activeY: y,
        activeRotation: 0,
        lastMoveWasRotation: true,
      });
      (game as any).lockPiece('human', player);
      expect(player.otherSpins[piece]).toBe(1);
      expect(player.tSpins).toBe(0);
      expect(player.lines).toBeGreaterThan(0);
      game.stop();
    },
  );

  it('does not count a zero-line spin or an ordinary line clear', () => {
    for (const clears of [false, true]) {
      const server: any = { to: () => ({ emit: jest.fn() }) };
      const game = new GameInstance('no-spin', server, 42);
      game.addPlayer('human', 'user');
      const player = game.getPlayers().get('human')!;
      const { board, y } = fixture('I');
      if (!clears) board[39][0] = null;
      Object.assign(player, {
        board,
        activeMino: 'I',
        activeX: 3,
        activeY: y,
        activeRotation: 0,
        lastMoveWasRotation: !clears,
      });
      (game as any).lockPiece('human', player);
      expect(player.otherSpins.I).toBe(0);
      game.stop();
    }
  });
});
