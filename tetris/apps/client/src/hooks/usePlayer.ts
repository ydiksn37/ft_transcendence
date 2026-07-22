import { useState, useCallback } from 'react';
import { checkCollision, STAGE_WIDTH, type Cell } from '../utils/gameHelpers';
import { randomTetromino, peekNextTetrominoKeys, TETROMINOS } from '../utils/tetrominos';

export type Player = {
  pos: { x: number; y: number };
  tetromino: (string | number)[][];
  collided: boolean;
  rotationIndex: number;
  spawnCount: number;
  lastAction?: 'move' | 'rotate' | 'drop' | 'spawn';
  kickIndex?: number;
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
    rotationIndex: 0,
    spawnCount: 0,
    lastAction: 'spawn',
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

  const movePlayerHorizontal = useCallback((dir: number, stage: Cell[][], isArrZero: boolean) => {
    setPlayer(prev => {
      if (isArrZero) {
        let currentX = prev.pos.x;
        let distance = 0;
        while (!checkCollision({ ...prev, pos: { ...prev.pos, x: currentX } }, stage, { x: dir, y: 0 })) {
          currentX += dir;
          distance += dir;
        }
        if (distance === 0) return prev;
        return {
          ...prev,
          pos: { x: currentX, y: prev.pos.y },
          collided: false,
          lastAction: 'move',
        };
      } else {
        if (!checkCollision(prev, stage, { x: dir, y: 0 })) {
          return {
            ...prev,
            pos: { x: prev.pos.x + dir, y: prev.pos.y },
            collided: false,
            lastAction: 'move',
          };
        }
        return prev;
      }
    });
  }, []);

  const resetPlayer = useCallback((width: number = STAGE_WIDTH) => {
    const nextTetromino = randomTetromino().shape;
    setPlayer(prev => ({
      pos: { x: Math.floor(width / 2) - Math.ceil(nextTetromino[0].length / 2), y: 0 },
      tetromino: nextTetromino,
      collided: false,
      rotationIndex: 0,
      spawnCount: prev.spawnCount + 1,
      lastAction: 'spawn',
      kickIndex: 0,
    }));
    setNextPieceKeys(peekNextTetrominoKeys(5)); // peek at new next pieces
    setHoldInfo(prev => ({ ...prev, hasHeld: false }));
  }, []);

  const resetHold = useCallback(() => {
    setHoldInfo({ tetromino: null, hasHeld: false });
  }, []);

  const playerHold = useCallback((width: number = STAGE_WIDTH) => {
    if (holdInfo.hasHeld) return;

    const currentType = player.tetromino.flat().find(cell => cell !== 0) as string;
    if (!currentType) return;

    if (holdInfo.tetromino) {
      // Swap with existing hold — does NOT consume next piece
      const heldTetromino = TETROMINOS[holdInfo.tetromino as keyof typeof TETROMINOS].shape;
      setPlayer(prev => ({
        pos: { x: Math.floor(width / 2) - Math.ceil(heldTetromino[0].length / 2), y: 0 },
        tetromino: heldTetromino,
        collided: false,
        rotationIndex: 0,
        spawnCount: prev.spawnCount + 1,
        lastAction: 'spawn',
        kickIndex: 0,
      }));
    } else {
      // No hold piece yet — consume next piece from bag
      const nextTetromino = randomTetromino().shape;
      setPlayer(prev => ({
        pos: { x: Math.floor(width / 2) - Math.ceil(nextTetromino[0].length / 2), y: 0 },
        tetromino: nextTetromino,
        collided: false,
        rotationIndex: 0,
        spawnCount: prev.spawnCount + 1,
        lastAction: 'spawn',
        kickIndex: 0,
      }));
      setNextPieceKeys(peekNextTetrominoKeys(5));
    }

    setHoldInfo({ tetromino: currentType, hasHeld: true });
  }, [player.tetromino, holdInfo]);

  const playerRotate = useCallback((stage: Cell[][], dir: number) => {
    setPlayer(prev => {
      const clonedPlayer: Player = JSON.parse(JSON.stringify(prev));

      // O-piece (2×2): no rotation
      if (clonedPlayer.tetromino.length === 2) return prev;

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

      let kickIdx = 0;
      for (const [offsetX, offsetY] of actualKicks) {
        clonedPlayer.pos.x = prev.pos.x + offsetX;
        clonedPlayer.pos.y = prev.pos.y + offsetY;
        if (!checkCollision(clonedPlayer, stage, { x: 0, y: 0 })) {
          clonedPlayer.lastAction = 'rotate';
          clonedPlayer.kickIndex = kickIdx;
          return clonedPlayer;
        }
        kickIdx++;
      }
      return prev;
    });
  }, []);

  return [
    player,
    updatePlayerPos,
    resetPlayer,
    playerRotate,
    playerHold,
    holdInfo,
    resetHold,
    nextPieceKeys,
    movePlayerHorizontal,
    setPlayer,
  ] as const;
};
