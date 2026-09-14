import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { AiDifficulty, GameState } from '@transcendence/shared';
import { setRandomSeed } from '../utils/tetrominos';
import { createStage, type Cell } from '../utils/gameHelpers';

type UseMultiplayerProps = {
  setServerState: (state: GameState | null) => void;
  setStartTime: (time: number | null) => void;
  appState: string;
  appStateRef: MutableRefObject<string>;
  gameOverRef: MutableRefObject<boolean>;
  setAppState: (s: 'MENU' | 'CONFIG' | 'PLAYING' | 'RECORDS' | 'ONLINE_1V1' | 'CUSTOM_ROOMS' | 'SPECTATING' | 'VS_SCREEN') => void;
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
  nextPieceKeys: string[];
  holdInfo: { tetromino: string | null; hasHeld: boolean };
  socket: Socket | null;
  setSocket: Dispatch<SetStateAction<Socket | null>>;
  socketRef: React.MutableRefObject<Socket | null>;
  isWaiting: boolean;
  setIsWaiting: Dispatch<SetStateAction<boolean>>;
  setConnectionError: Dispatch<SetStateAction<string | null>>;
  setOpponentStage: Dispatch<SetStateAction<Cell[][] | null>>;
  setOpponentScore: Dispatch<SetStateAction<number>>;
  setOpponentNextPieceKeys: Dispatch<SetStateAction<string[]>>;
  setOpponentHoldMino: Dispatch<SetStateAction<string | null>>;
  setOpponents: Dispatch<SetStateAction<Record<string, any>>>;
  setMyDisplayName: Dispatch<SetStateAction<string | null>>;
  matchResult: 'WIN' | 'TOURNAMENT_WIN' | 'LOSE' | null;
  setMatchResult: Dispatch<SetStateAction<'WIN' | 'TOURNAMENT_WIN' | 'LOSE' | null>>;
  setPendingGarbage: Dispatch<SetStateAction<number[]>>;
  pendingGarbageRef: MutableRefObject<number[]>;
  token: string | null;
};

export const useMultiplayer = ({
  setServerState, setStartTime,
  appState, appStateRef, gameOverRef, setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold,
  setScore, setLevel, setLines, gameOver, setGameOver, setDropTime, startGame,
  stage, score, nextPieceKeys, holdInfo,
  socket, setSocket, socketRef,
  isWaiting, setIsWaiting, setConnectionError,
  setOpponentStage, setOpponentScore, setOpponentNextPieceKeys, setOpponentHoldMino, setOpponents, setMyDisplayName,
  matchResult, setMatchResult,
  setPendingGarbage, pendingGarbageRef, token
}: UseMultiplayerProps) => {

  const socketOptions = useMemo(
    () => token
      ? { forceNew: true as const, auth: { token } }
      : { forceNew: true as const },
    [token],
  );

  const [customRoomIsPlaying, setCustomRoomIsPlaying] = useState(false);
  const activeRoom = useRef<string | null>(null);
  const isSpectatingRef = useRef(false);
  const beginServerMatch = (data: { roomId: string; users?: Record<string, { username: string | null }>; players?: string[]; displayNames?: Record<string, string> }) => {
    activeRoom.current = data.roomId;
    isSpectatingRef.current = false;
    setServerState(null);
    setStartTime(Date.now());
    const initialOpponents: Record<string, any> = {};
    if (data.displayNames && socketRef.current) {
      if (data.displayNames[socketRef.current.id]) {
        setMyDisplayName(data.displayNames[socketRef.current.id]);
      }
      for (const [sid, dName] of Object.entries(data.displayNames)) {
        if (sid !== socketRef.current.id && (!data.players || data.players.includes(sid))) {
          initialOpponents[sid] = {
            stage: Array.from({ length: 20 }, () => Array(10).fill([0, 'clear'])),
            score: 0,
            displayName: dName,
            playerIndex: data.players ? data.players.indexOf(sid) : undefined
          };
        }
      }
    } else if (data.users && socketRef.current) {
      // Fallback for older formats
      for (const [sid, user] of Object.entries(data.users)) {
        if (sid !== socketRef.current.id && (!data.players || data.players.includes(sid))) {
          initialOpponents[sid] = {
            stage: Array.from({ length: 20 }, () => Array(10).fill([0, 'clear'])),
            score: 0,
            username: user.username,
            playerIndex: data.players ? data.players.indexOf(sid) : undefined
          };
        }
      }
    }
    setOpponents(initialOpponents);
    setOpponentStage(null);
    gameOverRef.current = false;
    appStateRef.current = 'VS_SCREEN';
    setGameOver(false);
    setMatchResult(null);
    setIsWaiting(false);
    setGameMode('ONLINE_1V1');
    setAppState('VS_SCREEN');
    // READY can already have a board/Next; input waits for server start.
    setDropTime(null);
  };
  const listenToServer = (connection: Socket) => {
    connection.on('game:state', (state: GameState & { roomId: string; started: boolean }) => {
      if (state.roomId !== activeRoom.current || appStateRef.current === 'SPECTATING') return;
      setServerState(state);
      setDropTime(state.started && !state.isGameOver ? 1000 : null);
    });
    connection.on('game:start', (data: { roomId: string }) => {
      if (data.roomId === activeRoom.current) {
        setStartTime(Date.now());
        if (appStateRef.current === 'VS_SCREEN') {
          const nextState = isSpectatingRef.current ? 'SPECTATING' : 'ONLINE_1V1';
          appStateRef.current = nextState;
          setAppState(nextState);
        }
      }
    });
  };

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
    setOpponents({});
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

    listenToServer(newSocket);
    newSocket.on('match:found', beginServerMatch);

    newSocket.on('waiting_for_match', () => {
      setIsWaiting(true);
    });

    newSocket.on('opponent_board_update', (data: { playerId?: string; stage: Cell[][]; score: number; next?: string[]; hold?: string | null; isGameOver?: boolean; }) => {
      if ((data as { roomId?: string }).roomId !== activeRoom.current) return;
      // 従来の1対1用（後方互換）
      setOpponentStage(data.stage);
      setOpponentScore(data.score);
      if (data.next) setOpponentNextPieceKeys(data.next);
      if (data.hold !== undefined) setOpponentHoldMino(data.hold);

      // 複数人用
      if (data.playerId) {
        setOpponents(prev => ({
          ...prev,
          [data.playerId as string]: {
            stage: data.stage,
            score: data.score,
            nextPieceKeys: data.next ?? prev[data.playerId as string]?.nextPieceKeys ?? [],
            holdMino: data.hold !== undefined ? data.hold : prev[data.playerId as string]?.holdMino ?? null,
            isGameOver: data.isGameOver,
            username: prev[data.playerId as string]?.username,
            playerIndex: prev[data.playerId as string]?.playerIndex,
            displayName: prev[data.playerId as string]?.displayName
          }
        }));
      }
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

    newSocket.on('game:over', (data: { roomId: string; loserId: string; winnerId: string | null }) => {
      if (data.roomId !== activeRoom.current) return;
      if (data.loserId === newSocket.id) {
        setMatchResult('LOSE');
        setGameOver(true);
        setDropTime(null);
      } else if (data.winnerId === newSocket.id) {
        setMatchResult('WIN');
        setGameOver(true);
        setDropTime(null);
      } else if (data.winnerId) {
        // 勝者が自分以外に決まった
        setMatchResult('LOSE');
        setGameOver(true);
        setDropTime(null);
      }
    });

    newSocket.on('tournament_win', (data: { winnerId: string }) => {
      if (data.winnerId === newSocket.id) {
        setMatchResult('TOURNAMENT_WIN');
      }
    });

    newSocket.on('disconnect', (reason: string) => {
      if (reason === 'io client disconnect') return;
      if (!gameOverRef.current) {
        setMatchResult(prev => prev === null ? 'WIN' : prev);
        setGameOver(true);
        setDropTime(null);
      }
    });

  }, [socket, setSocket, setGameMode, setAppState, setIsWaiting, setConnectionError, setOpponentStage,
    setOpponentScore, setPendingGarbage, pendingGarbageRef, setStage, stageRef,
    resetPlayer, resetHold, setScore, setLevel, setLines, setGameOver,
    setMatchResult, socketOptions, socketRef, startGame, setDropTime, gameOverRef]);

  const setupCustomRoomConnection = useCallback(() => {
    setAppState('CUSTOM_ROOMS');
    setGameMode('ONLINE_1V1');
    setIsWaiting(true);
    setConnectionError(null);
    setOpponentStage(createStage(10));
    setOpponentScore(0);
    setOpponents({});
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

    listenToServer(newSocket);
    newSocket.on('match:found', beginServerMatch);

    newSocket.on('opponent_board_update', (data: { playerId?: string; stage: Cell[][]; score: number; next?: string[]; hold?: string | null; isGameOver?: boolean; }) => {
      if ((data as { roomId?: string }).roomId !== activeRoom.current) return;
      // 従来の1対1用（後方互換）
      setOpponentStage(data.stage);
      setOpponentScore(data.score);
      if (data.next) setOpponentNextPieceKeys(data.next);
      if (data.hold !== undefined) setOpponentHoldMino(data.hold);

      // 複数人用
      if (data.playerId) {
        setOpponents(prev => ({
          ...prev,
          [data.playerId as string]: {
            stage: data.stage,
            score: data.score,
            nextPieceKeys: data.next ?? prev[data.playerId as string]?.nextPieceKeys ?? [],
            holdMino: data.hold !== undefined ? data.hold : prev[data.playerId as string]?.holdMino ?? null,
            isGameOver: data.isGameOver,
            username: prev[data.playerId as string]?.username,
            playerIndex: prev[data.playerId as string]?.playerIndex,
            displayName: prev[data.playerId as string]?.displayName
          }
        }));
      }
    });

    newSocket.on('receive_garbage', (data: { lines: number }) => {
      pendingGarbageRef.current = [...pendingGarbageRef.current, data.lines];
      setPendingGarbage(pendingGarbageRef.current);
    });

    newSocket.on('game:over', (data: { roomId: string; loserId: string; winnerId: string | null }) => {
      if (data.roomId !== activeRoom.current) return;
      if (appStateRef.current === 'SPECTATING') return;
      // 自分が負けた場合
      if (data.loserId === newSocket.id) {
        setMatchResult('LOSE');
        setGameOver(true);
        setDropTime(null);
      }
      // 勝者が決まった場合、自分が勝者かどうか
      else if (data.winnerId) {
        if (data.winnerId === newSocket.id) {
          setMatchResult('WIN');
        } else {
          setMatchResult('LOSE'); // 自分以外の誰かが勝った
        }
        setGameOver(true);
        setDropTime(null);
      }
    });

    newSocket.on('tournament_win', (data: { winnerId: string }) => {
      if (appStateRef.current === 'SPECTATING') return;
      if (data.winnerId === newSocket.id) {
        setMatchResult('TOURNAMENT_WIN');
      }
    });

    newSocket.on('spectating', (data: { roomId: string; displayNames?: Record<string, string>; players?: string[]; isStarted?: boolean }) => {
      activeRoom.current = data.roomId;
      isSpectatingRef.current = true;
      setServerState(null);
      
      const initialOpponents: Record<string, any> = {};
      if (data.displayNames && socketRef.current) {
        if (data.displayNames[socketRef.current.id]) {
          setMyDisplayName(data.displayNames[socketRef.current.id]);
        }
        for (const [sid, dName] of Object.entries(data.displayNames)) {
          if (sid !== socketRef.current.id && (!data.players || data.players.includes(sid))) {
            initialOpponents[sid] = {
              stage: Array.from({ length: 20 }, () => Array(10).fill([0, 'clear'])),
              score: 0,
              displayName: dName,
              playerIndex: data.players ? data.players.indexOf(sid) : undefined
            };
          }
        }
      }
      setOpponents(initialOpponents);
      
      setOpponentStage(null);
      setMatchResult(null);
      setGameOver(false);
      gameOverRef.current = false;
      
      if (data.isStarted) {
        appStateRef.current = 'SPECTATING';
        setAppState('SPECTATING');
      } else {
        appStateRef.current = 'VS_SCREEN';
        setAppState('VS_SCREEN');
      }
      
      setIsWaiting(false);
      setDropTime(null);
      setGameMode('ONLINE_1V1');
    });

    newSocket.on('custom_room_state', (data: { isPlaying: boolean }) => {
      setCustomRoomIsPlaying(data.isPlaying);
      // 観戦中（SPECTATING）に試合が終了した場合のみゲームオーバー画面を表示する。
      // ONLINE_1V1 中は game:over イベントで管理するため、ここでは SPECTATING のみを対象にする。
      // こうしないと次のトーナメントラウンド開始時に isPlaying=false が届いた際に
      // 不正に setGameOver(true) が呼ばれてホワイトアウトが起きる。
      if (appStateRef.current === 'SPECTATING' && !data.isPlaying) {
        setGameOver(true);
      }
    });

    // match:found establishes the server match; game:start must not start a
    // second, browser-owned simulation.

    newSocket.on('disconnect', (reason: string) => {
      if (reason === 'io client disconnect') return;
      if (!gameOver) {
        setMatchResult(prev => prev === null ? 'WIN' : prev);
        setGameOver(true);
        setDropTime(null);
      }
    });



  }, [setAppState, setGameMode, setIsWaiting, setConnectionError, setOpponentStage, setOpponentScore,
    setPendingGarbage, pendingGarbageRef, setStage, stageRef, resetPlayer,
    resetHold, setScore, setLevel, setLines, setGameOver, setMatchResult,
    socketOptions, setSocket, socketRef, startGame, setDropTime, appStateRef, gameOverRef]);

  const startVsAi = useCallback((difficulty: AiDifficulty, actionDelayMs = 50) => {
    activeRoom.current = null;
    setServerState(null);
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
    setOpponents({});
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

    newSocket.on('opponent_board_update', (data: { playerId?: string; stage: Cell[][]; score: number; next?: string[]; hold?: string | null; isGameOver?: boolean; }) => {
      // 従来の1対1用（後方互換）
      setOpponentStage(data.stage);
      setOpponentScore(data.score);
      if (data.next) setOpponentNextPieceKeys(data.next);
      if (data.hold !== undefined) setOpponentHoldMino(data.hold);

      // 複数人用
      if (data.playerId) {
        setOpponents(prev => ({
          ...prev,
          [data.playerId as string]: {
            stage: data.stage,
            score: data.score,
            nextPieceKeys: data.next ?? prev[data.playerId as string]?.nextPieceKeys ?? [],
            holdMino: data.hold !== undefined ? data.hold : prev[data.playerId as string]?.holdMino ?? null,
            isGameOver: data.isGameOver,
            username: prev[data.playerId as string]?.username,
            playerIndex: prev[data.playerId as string]?.playerIndex,
            displayName: prev[data.playerId as string]?.displayName
          }
        }));
      }
    });

    newSocket.on('receive_garbage', (data: { lines: number }) => {
      pendingGarbageRef.current = [...pendingGarbageRef.current, data.lines];
      setPendingGarbage(pendingGarbageRef.current);
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
    if (socket && activeRoom.current === null && appState === 'ONLINE_1V1' && !isWaiting) {
      socket.emit('board_update', { stage, score, next: nextPieceKeys, hold: holdInfo.tetromino });
    }
  }, [stage, score, nextPieceKeys, holdInfo, socket, appState, isWaiting]);

  useEffect(() => {
    if (socket && activeRoom.current === null && gameOver && appState === 'ONLINE_1V1' && matchResult === 'LOSE') {
      socket.emit('game_over');
    }
  }, [gameOver, socket, appState, matchResult]);

  return { joinOnline, setupCustomRoomConnection, startVsAi, customRoomIsPlaying, isSpectatingRef };
};
