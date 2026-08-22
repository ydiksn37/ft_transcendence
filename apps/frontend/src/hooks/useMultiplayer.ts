import { useEffect, useCallback } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { setRandomSeed } from '../utils/tetrominos';
import { createStage, type Cell } from '../utils/gameHelpers';

type UseMultiplayerProps = {
  appState: string;
  setAppState: (s: 'MENU' | 'CONFIG' | 'PLAYING' | 'RECORDS' | 'ONLINE_1V1' | 'CUSTOM_ROOMS') => void;
  setGameMode: (m: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1') => void;
  setStage: Dispatch<SetStateAction<Cell[][]>>;
  stageRef: MutableRefObject<Cell[][]>;
  resetPlayer: (w: number, stage?: Cell[][]) => void;
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
  socketRef: React.MutableRefObject<Socket | null>;
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
  appState, setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold,
  setScore, setLevel, setLines, gameOver, setGameOver, setDropTime, startGame,
  stage, score,
  socket, setSocket, socketRef,
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
    setGameMode('ONLINE_1V1');
    setAppState('ONLINE_1V1');
    setIsWaiting(true);
    setOpponentStage(createStage(10));
    setOpponentScore(0);
    setPendingGarbage([]);
    pendingGarbageRef.current = [];

    const newStage = createStage(10);
    setStage(newStage);
    stageRef.current = newStage;
    resetPlayer(10, newStage);
    resetHold();
    setScore(0);
    setLevel(1);
    setLines(0);
    setGameOver(false);
    setMatchResult(null);

    const newSocket = io('/', { forceNew: true });
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      newSocket.emit('match:join_queue');
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
      setMatchResult(prev => prev === null ? 'WIN' : prev);
      setGameOver(true);
      setDropTime(null);
    });

    newSocket.on('opponent_disconnected', () => {
      setMatchResult(prev => prev === null ? 'WIN' : prev);
      setGameOver(true);
      setDropTime(null);
    });
  }, [setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold, setScore, setLevel, setLines, setGameOver, startGame, setDropTime]);

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
    resetPlayer(10, newStage);
    resetHold();
    setScore(0);
    setLevel(1);
    setLines(0);
    setGameOver(false);
    setMatchResult(null);

    const newSocket = io('/', { forceNew: true });
    setSocket(newSocket);
    socketRef.current = newSocket;

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
      setMatchResult(prev => prev === null ? 'WIN' : prev);
      setGameOver(true);
      setDropTime(null);
    });

    newSocket.on('opponent_disconnected', () => {
      setMatchResult(prev => prev === null ? 'WIN' : prev);
      setGameOver(true);
      setDropTime(null);
    });
  }, [setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold, setScore, setLevel, setLines, setGameOver, startGame, setDropTime]);

  const startVsAi = useCallback((difficulty: string) => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setGameMode('ONLINE_1V1'); // Reusing ONLINE_1V1 for game physics mode
    setAppState('ONLINE_1V1'); // Reusing ONLINE_1V1 for UI state
    setIsWaiting(true);
    setOpponentStage(createStage(10));
    setOpponentScore(0);
    setPendingGarbage([]);
    pendingGarbageRef.current = [];

    const newStage = createStage(10);
    setStage(newStage);
    stageRef.current = newStage;
    resetPlayer(10, newStage);
    resetHold();
    setScore(0);
    setLevel(1);
    setLines(0);
    setGameOver(false);
    setMatchResult(null);

    const newSocket = io('/', { forceNew: true });
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      newSocket.emit('game:start_vs_ai', { difficulty });
    });

    // バックエンドは match:found に seed を入れて送信する
    newSocket.on('match:found', (data: { roomId: string; seed: number; vsAi: boolean }) => {
      setRandomSeed(data.seed);
      setIsWaiting(false);
    });

    // game:start でゲームを開始する（GameInstance.start() から emit される）
    newSocket.on('game:start', () => {
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
      setMatchResult(prev => prev === null ? 'WIN' : prev);
      setGameOver(true);
      setDropTime(null);
    });

    newSocket.on('disconnect', (reason: string) => {
      if (!gameOver) {
        setMatchResult(prev => prev === null ? 'WIN' : prev);
        setGameOver(true);
        setDropTime(null);
      }
    });
  }, [setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold, setScore, setLevel, setLines, setGameOver, startGame, setDropTime, gameOver]);

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [socketRef]);

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

  return { joinOnline, setupCustomRoomConnection, startVsAi };
};
