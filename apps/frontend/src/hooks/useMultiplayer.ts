import { useEffect, useCallback, useMemo } from 'react';
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
  setConnectionError: Dispatch<SetStateAction<string | null>>;
  setOpponentStage: Dispatch<SetStateAction<Cell[][] | null>>;
  setOpponentScore: Dispatch<SetStateAction<number>>;
  matchResult: 'WIN' | 'LOSE' | null;
  setMatchResult: Dispatch<SetStateAction<'WIN' | 'LOSE' | null>>;
  setPendingGarbage: Dispatch<SetStateAction<number[]>>;
  pendingGarbageRef: MutableRefObject<number[]>;
  token: string | null;
};

export const useMultiplayer = ({
  appState, setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold,
  setScore, setLevel, setLines, gameOver, setGameOver, setDropTime, startGame,
  stage, score,
  socket, setSocket, socketRef,
  isWaiting, setIsWaiting, setConnectionError,
  setOpponentStage, setOpponentScore,
  matchResult, setMatchResult,
  setPendingGarbage, pendingGarbageRef, token
}: UseMultiplayerProps) => {

  const socketOptions = useMemo(
    () => token
      ? { forceNew: true as const, auth: { token } }
      : { forceNew: true as const },
    [token],
  );

  const joinOnline = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setGameMode('ONLINE_1V1');
    setAppState('ONLINE_1V1');
    setIsWaiting(true);
    setConnectionError(null);
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

    const newSocket = io('/', socketOptions);
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      setConnectionError(null);
      newSocket.emit('match:join_queue');
    });

    newSocket.on('connect_error', () => {
      setConnectionError('GAME SERVER IS UNAVAILABLE. RETRYING...');
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
  }, [socket, setSocket, setGameMode, setAppState, setIsWaiting, setConnectionError, setOpponentStage,
    setOpponentScore, setPendingGarbage, pendingGarbageRef, setStage, stageRef,
    resetPlayer, resetHold, setScore, setLevel, setLines, setGameOver,
    setMatchResult, socketOptions, socketRef, startGame, setDropTime]);

  const setupCustomRoomConnection = useCallback(() => {
    setAppState('CUSTOM_ROOMS');
    setGameMode('ONLINE_1V1');
    setIsWaiting(true);
    setConnectionError(null);
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

    const newSocket = io('/', socketOptions);
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on('connect', () => setConnectionError(null));
    newSocket.on('connect_error', () => {
      setConnectionError('GAME SERVER IS UNAVAILABLE. RETRYING...');
    });

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
  }, [setAppState, setGameMode, setIsWaiting, setConnectionError, setOpponentStage, setOpponentScore,
    setPendingGarbage, pendingGarbageRef, setStage, stageRef, resetPlayer,
    resetHold, setScore, setLevel, setLines, setGameOver, setMatchResult,
    socketOptions, setSocket, socketRef, startGame, setDropTime]);

  const startVsAi = useCallback((difficulty: string, actionDelayMs = 50) => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setGameMode('ONLINE_1V1'); // Reusing ONLINE_1V1 for game physics mode
    setAppState('ONLINE_1V1'); // Reusing ONLINE_1V1 for UI state
    setIsWaiting(true);
    setConnectionError(null);
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

    const newSocket = io('/', socketOptions);
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      setConnectionError(null);
      newSocket.emit('game:start_vs_ai', { difficulty, actionDelayMs });
    });

    newSocket.on('connect_error', () => {
      setConnectionError('GAME SERVER IS UNAVAILABLE. RETRYING...');
    });

    // バックエンドは match:found に seed を入れて送信する
    newSocket.on('match:found', (data: { roomId: string; seed: number; vsAi: boolean }) => {
      setRandomSeed(data.seed);
    });

    // game:start でゲームを開始する（GameInstance.start() から emit される）
    newSocket.on('game:start', () => {
      startGame('ONLINE_1V1');
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

    newSocket.on('game:over', (data: { loserId: string; winnerId: string | null }) => {
      const didAiLose = data.loserId.startsWith('ai_');
      setMatchResult(didAiLose ? 'WIN' : 'LOSE');
      setGameOver(true);
      setDropTime(null);
    });

    newSocket.on('disconnect', (reason: string) => {
      if (reason === 'io client disconnect') return;
      if (!gameOver) {
        setMatchResult(prev => prev === null ? 'WIN' : prev);
        setGameOver(true);
        setDropTime(null);
      }
    });
  }, [socket, setSocket, setGameMode, setAppState, setIsWaiting, setConnectionError, setOpponentStage,
    setOpponentScore, setPendingGarbage, pendingGarbageRef, setStage, stageRef,
    resetPlayer, resetHold, setScore, setLevel, setLines, setGameOver,
    setMatchResult, socketOptions, socketRef, startGame, setDropTime, gameOver]);

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
