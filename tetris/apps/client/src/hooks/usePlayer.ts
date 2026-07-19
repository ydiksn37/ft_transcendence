import { useState, useCallback } from 'react';
import { checkCollision } from '../utils/gameHelpers';
import { randomTetromino, TETROMINOS } from '../utils/tetrominos';
import { STAGE_WIDTH } from '../utils/gameHelpers';

export type Player = {
	pos: { x: number; y: number };
	tetromino: (string | number)[][];
	collided: boolean;
	rotationIndex: number;
};

const WALL_KICKS_NORMAL: Record<string, number[][]> = {
  "0->1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1->0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1->2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2->1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2->3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3->2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3->0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0->3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
};

const WALL_KICKS_I: Record<string, number[][]> = {
  "0->1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1->0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1->2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2->1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2->3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3->2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3->0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0->3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
};

export const usePlayer = () => {
	const [player, setPlayer] = useState<Player>({
		pos: { x: 0, y: 0 },
		tetromino: TETROMINOS[0].shape,
		collided: false,
	});

	const [holdInfo, setHoldInfo] = useState<{ tetromino: string | null; hasHeld: boolean }>({
		tetromino: null,
		hasHeld: false,
	});

	const updatePlayerPos = ({ x, y, collided }: { x: number; y: number; collided: boolean }) => {
		setPlayer(prev => ({
			...prev,
			pos: { x: prev.pos.x + x, y: prev.pos.y + y },
			collided,
		}));
	};

	const resetPlayer = useCallback(() => {
		setPlayer({
			pos: { x: STAGE_WIDTH / 2 - 2, y: 0 },
			tetromino: randomTetromino().shape,
			collided: false,
			rotationIndex: 0,
		});
		setHoldInfo(prev => ({ ...prev, hasHeld: false}));
	}, []);

	const resetHold = useCallback(() => {
		setHoldInfo({ tetromino: null, hasHeld: false });
	}, []);

	const playerHold = useCallback(() => {
		if (holdInfo.hasHeld) return;

		const currentType = player.tetromino.flat().find(cell => cell !== 0) as string;
		if (!currentType) return;

		if (holdInfo.tetromino) {
			setPlayer({
				pos: { x: STAGE_WIDTH / 2 - 2, y: 0 },
				tetromino: TETROMINOS[holdInfo.tetromino as keyof typeof TETROMINOS].shape,
				collided: false,
				rotationIndex: 0,
			});
		} else {
			setPlayer({
				pos: { x: STAGE_WIDTH / 2 - 2, y: 0 },
				tetromino: randomTetromino().shape,
				collided: false,
				rotationIndex: 0,
			});
		}

		setHoldInfo({ tetromino: currentType, hasHeld: true });
	}, [player.tetromino, holdInfo]);

	const rotate = (matrix: any[][], dir: number) => {
		const rotatedTetro = matrix.map((_, index) =>
			matrix.map(col => col[index])
	   );
	   if (dir > 0) return rotatedTetro.map(row => row.reverse());
	   return rotatedTetro.reverse();
	};

	const playerRotate = (stage: any[], dir: number) => {
		const clonedPlayer = JSON.parse(JSON.stringify(player));

		if (clonedPlayer.tetromino.length === 2) return;

		const currentRotationIndex = clonedPlayer.rotationIndex;
		const nextRotationIndex = (currentRotationIndex + dir + 4) % 4;
		const transition = `${currentRotationIndex}->${nextRotationIndex}`;

		clonedPlayer.tetromino = rotate(clonedPlayer.tetromino, dir);
		clonedPlayer.rotationIndex = nextRotationIndex;

		const isITetromino = clonedPlayer.tetromino.length === 4;
		const kicks = isITetromino ? WALL_KICKS_I[transition] : WALL_KICKS_NORMAL[transition];

		for (let i = 0; i < kicks.length; i++) {
			const [offsetX, offsetY] = kicks[i];

			clonedPlayer.pos.x = player.pos.x + offsetX;
			clonedPlayer.pos.y = player.pos.y + offsetY;

			if (!checkCollision(clonedPlayer, stage, { x: 0, y: 0 })) {
				setPlayer(clonedPlayer);
				return;
			}
		}
	};
	return [player, updatePlayerPos, resetPlayer, playerRotate, playerHold, holdInfo, resetHold] as const;
};
