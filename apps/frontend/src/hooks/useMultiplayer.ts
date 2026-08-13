import { useEffect, useCallback } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { setRandomSeed } from '../utils/tetrominos';
import { createStage, type Cell } from '../utils/gameHelpers';

type UseMultiplayerProps = {
  appState: string;
  setStage: Dispatch<SetStateAction<Cell[][]>>;
  stageRef: MutableRefObject<Cell[][]>;
  resetPlayer: (w: number) => void;
  resetHold: () => void;
  setScore: Dispatch<SetStateAction<number>>;
  setLevel: Dispatch<SetStateAction<number>>;
  setLines: Dispatch<SetStateAction<number>>;
  gameOver: boolean;
  setGameOver: Dispatch<SetStateAction<boolean>>;
  setDropTime: Dispatch<SetStateAction<number | null>>;
  startGame: (mode?: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1') => void;
  stage: Cell[][];
  score: number;
  socket: Socket | null;
  setSocket: Dispatch<SetStateAction<Socket | null>>;
  isWaiting: boolean;
  setIsWaiting: Dispatch<SetStateAction<boolean>>;
  setOpponentStage: Dispatch<SetStateAction<Cell[][] | null>>;
  setOpponentScore: Dispatch<SetStateAction<number>>;
  matchResult: 'WIN' | 'LOSE' | null;
  setMatchResult: Dispatch<SetStateAction<'WIN' | 'LOSE' | null>>;
  setPendingGarbage: Dispatch<SetStateAction<number[]>>;
  pendingGarbageRef: MutableRefObject<number[]>;
};

export const useMultiplayer = ({
  appState, setStage, stageRef, resetPlayer, resetHold,
  setScore, setLevel, setLines, gameOver, setGameOver, setDropTime, startGame,
  stage, score,
  socket, setSocket,
  isWaiting, setIsWaiting,
  setOpponentStage, setOpponentScore,
  matchResult, setMatchResult,
  setPendingGarbage, pendingGarbageRef
}: UseMultiplayerProps) => {

  const joinOnline = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setIsWaiting(true);
    setOpponentStage(createStage(10));
    setOpponentScore(0);
    setPendingGarbage([]);
    pendingGarbageRef.current = [];

    const newStage = createStage(10);
    setStage(newStage);
    stageRef.current = newStage;
    resetPlayer(10);
    resetHold();
    setScore(0);
    setLevel(1);
    setLines(0);
    setGameOver(false);
    setMatchResult(null);

    const newSocket = io('/');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join_matchmaking');
    });

    newSocket.on('match:found', (data: { playerNum: number; seed: number }) => {
      setRandomSeed(data.seed);
      setTimeout(() => startGame('ONLINE_1V1'), 100);
    });

    newSocket.on('waiting_for_match', () => {
      setIsWaiting(true);
    });

    newSocket.on('opponent_board_update', (data: { stage: Cell[][]; score: number }) => {
      setOpponentStage(data.stage);
      setOpponentScore(data.score);
    });

    newSocket.on('receive_garbage', (data: { lines: number }) => {
      pendingGarbageRef.current = [...pendingGarbageRef.current, data.lines];
      setPendingGarbage(pendingGarbageRef.current);
    });

    newSocket.on('opponent_game_over', () => {
      setMatchResult('WIN');
      setGameOver(true);
      setDropTime(null);
    });

    newSocket.on('opponent_disconnected', () => {
      setMatchResult('WIN');
      setGameOver(true);
      setDropTime(null);
    });
  }, [setStage, stageRef, resetPlayer, resetHold, setScore, setLevel, setLines, setGameOver, startGame, setDropTime]);

  const setupCustomRoomConnection = useCallback(() => {
    setAppState('CUSTOM_ROOMS');
    setGameMode('ONLINE_1V1');
    setIsWaiting(true);
    setOpponentStage(createStage(10));
    setOpponentScore(0);
    setPendingGarbage([]);
    pendingGarbageRef.current = [];

    const newStage = createStage(10);
    setStage(newStage);
    stageRef.current = newStage;
    resetPlayer(10);
    resetHold();
    setScore(0);
    setLevel(1);
    setLines(0);
    setGameOver(false);
    setMatchResult(null);

    const newSocket = io('/');
    setSocket(newSocket);

    newSocket.on('match:found', (data: { playerNum: number; seed: number }) => {
      setRandomSeed(data.seed);
      setAppState('ONLINE_1V1');
      setIsWaiting(false);
      setTimeout(() => startGame('ONLINE_1V1'), 100);
    });

    newSocket.on('opponent_board_update', (data: { stage: Cell[][]; score: number }) => {
      setOpponentStage(data.stage);
      setOpponentScore(data.score);
    });

    newSocket.on('receive_garbage', (data: { lines: number }) => {
      pendingGarbageRef.current = [...pendingGarbageRef.current, data.lines];
      setPendingGarbage(pendingGarbageRef.current);
    });

    newSocket.on('opponent_game_over', () => {
      setMatchResult('WIN');
      setGameOver(true);
      setDropTime(null);
    });

    newSocket.on('opponent_disconnected', () => {
      setMatchResult('WIN');
      setGameOver(true);
      setDropTime(null);
    });
  }, [setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold, setScore, setLevel, setLines, setGameOver, startGame, setDropTime]);

  useEffect(() => {
    return () => {
      if (socket) socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (socket && appState === 'ONLINE_1V1' && !isWaiting) {
      socket.emit('board_update', { stage, score });
    }
  }, [stage, score, socket, appState, isWaiting]);

  useEffect(() => {
    if (socket && gameOver && appState === 'ONLINE_1V1' && matchResult === 'LOSE') {
      socket.emit('game_over');
    }
  }, [gameOver, socket, appState, matchResult]);

  return { joinOnline, setupCustomRoomConnection };
};
