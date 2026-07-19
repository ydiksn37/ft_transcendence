import { useState, useCallback } from 'react';
import { checkCollision, STAGE_WIDTH, type Cell } from '../utils/gameHelpers';
import { randomTetromino, peekNextTetrominoKeys, TETROMINOS } from '../utils/tetrominos';

export type Player = {
  pos: { x: number; y: number };
  tetromino: (string | number)[][];
  collided: boolean;
  rotationIndex: number;
};

// SRS wall-kick data (normal pieces)
const WALL_KICKS_NORMAL: Record<string, number[][]> = {
  '0->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3->2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3->0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

// SRS wall-kick data (I piece)
const WALL_KICKS_I: Record<string, number[][]> = {
  '0->1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1->0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1->2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2->1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2->3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3->2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3->0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0->3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

const rotate = (matrix: (string | number)[][], dir: number): (string | number)[][] => {
  if (dir === 2) {
    return [...matrix].reverse().map(row => [...row].reverse());
  }
  const transposed = matrix.map((_, i) => matrix.map(row => row[i]));
  if (dir > 0) return transposed.map(row => [...row].reverse());
  return [...transposed].reverse();
};

export const usePlayer = () => {
  const [player, setPlayer] = useState<Player>({
    pos: { x: 0, y: 0 },
    tetromino: TETROMINOS[0].shape,
    collided: false,
    rotationIndex: 0, // fix: was missing from initial state
  });

  const [holdInfo, setHoldInfo] = useState<{ tetromino: string | null; hasHeld: boolean }>({
    tetromino: null,
    hasHeld: false,
  });

  const [nextPieceKeys, setNextPieceKeys] = useState<string[]>([]);

  const updatePlayerPos = useCallback(
    ({ x, y, collided }: { x: number; y: number; collided: boolean }) => {
      setPlayer(prev => ({
        ...prev,
        pos: { x: prev.pos.x + x, y: prev.pos.y + y },
        collided,
      }));
    },
    []
  );

  const resetPlayer = useCallback(() => {
    setPlayer({
      pos: { x: STAGE_WIDTH / 2 - 2, y: 0 },
      tetromino: randomTetromino().shape, // consumes current "next" from bag
      collided: false,
      rotationIndex: 0,
    });
    setNextPieceKeys(peekNextTetrominoKeys(3)); // peek at new next pieces
    setHoldInfo(prev => ({ ...prev, hasHeld: false }));
  }, []);

  const resetHold = useCallback(() => {
    setHoldInfo({ tetromino: null, hasHeld: false });
  }, []);

  const playerHold = useCallback(() => {
    if (holdInfo.hasHeld) return;

    const currentType = player.tetromino.flat().find(cell => cell !== 0) as string;
    if (!currentType) return;

    if (holdInfo.tetromino) {
      // Swap with existing hold — does NOT consume next piece
      setPlayer({
        pos: { x: STAGE_WIDTH / 2 - 2, y: 0 },
        tetromino: TETROMINOS[holdInfo.tetromino as keyof typeof TETROMINOS].shape,
        collided: false,
        rotationIndex: 0,
      });
    } else {
      // No hold piece yet — consume next piece from bag
      setPlayer({
        pos: { x: STAGE_WIDTH / 2 - 2, y: 0 },
        tetromino: randomTetromino().shape,
        collided: false,
        rotationIndex: 0,
      });
      setNextPieceKeys(peekNextTetrominoKeys(3));
    }

    setHoldInfo({ tetromino: currentType, hasHeld: true });
  }, [player.tetromino, holdInfo]);

  const playerRotate = useCallback(
    (stage: Cell[][], dir: number) => {
      const clonedPlayer: Player = JSON.parse(JSON.stringify(player));

      // O-piece (2×2): no rotation
      if (clonedPlayer.tetromino.length === 2) return;

      const currentIdx = clonedPlayer.rotationIndex;
      const nextIdx = (currentIdx + dir + 4) % 4;
      const transition = `${currentIdx}->${nextIdx}`;

      clonedPlayer.tetromino = rotate(clonedPlayer.tetromino, dir);
      clonedPlayer.rotationIndex = nextIdx;

      // Use I-piece kicks for 4-row tetrominoes, normal kicks otherwise
      const isI = clonedPlayer.tetromino.length === 4;
      const kicks = isI ? WALL_KICKS_I[transition] : WALL_KICKS_NORMAL[transition];
      
      // If 180 rotation or undefined transition, fallback to just no kick [[0, 0]]
      const actualKicks = kicks || [[0, 0]];

      for (const [offsetX, offsetY] of actualKicks) {
        clonedPlayer.pos.x = player.pos.x + offsetX;
        clonedPlayer.pos.y = player.pos.y + offsetY;
        if (!checkCollision(clonedPlayer, stage, { x: 0, y: 0 })) {
          setPlayer(clonedPlayer);
          return;
        }
      }
    },
    [player]
  );

  return [
    player,
    updatePlayerPos,
    resetPlayer,
    playerRotate,
    playerHold,
    holdInfo,
    resetHold,
    nextPieceKeys,
  ] as const;
};
