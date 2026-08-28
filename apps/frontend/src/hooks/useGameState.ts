import { useState, useRef, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { Cell } from '../utils/gameHelpers';

export const useGameState = () => {
  const [appState, setAppState] = useState<'MENU' | 'CONFIG' | 'PLAYING' | 'RECORDS' | 'ONLINE_1V1' | 'CUSTOM_ROOMS'>('MENU');
  const appStateRef = useRef(appState);
  useEffect(() => { appStateRef.current = appState; }, [appState]);

  // Online Multiplayer States
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef(socket);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  const [isWaiting, setIsWaiting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [opponentStage, setOpponentStage] = useState<Cell[][] | null>(null);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentNextPieceKeys, setOpponentNextPieceKeys] = useState<string[]>([]);
  const [opponentHoldMino, setOpponentHoldMino] = useState<string | null>(null);
  const [opponents, setOpponents] = useState<Record<string, { stage: Cell[][]; score: number; nextPieceKeys?: string[]; holdMino?: string | null; isGameOver?: boolean }>>({});
  const [matchResult, setMatchResult] = useState<'WIN' | 'LOSE' | null>(null);
  const [pendingGarbage, setPendingGarbage] = useState<number[]>([]);
  const pendingGarbageRef = useRef<number[]>([]);

  const [gameMode, setGameMode] = useState<'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1'>('MARATHON');
  const gameModeRef = useRef(gameMode);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);



  const [startTime, setStartTime] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [finalTime, setFinalTime] = useState<number | null>(null);

  const [countdown, setCountdown] = useState<string | null>(null);
  const countdownRef = useRef(countdown);
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  const countdownTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [dropTime, setDropTime] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [piecesPlaced, setPiecesPlaced] = useState(0);
  const [attackLines, setAttackLines] = useState(0);

  useEffect(() => {
    if ((appState !== 'PLAYING' && appState !== 'ONLINE_1V1') || !startTime || gameOver) return;
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 20);
    return () => clearInterval(interval);
  }, [appState, gameMode, startTime, gameOver]);

  return {
    appState, setAppState, appStateRef,
    socket, setSocket, socketRef,
    isWaiting, setIsWaiting,
    connectionError, setConnectionError,
    opponentStage, setOpponentStage,
    opponentScore, setOpponentScore,
    opponentNextPieceKeys, setOpponentNextPieceKeys,
    opponentHoldMino, setOpponentHoldMino,
    opponents, setOpponents,
    matchResult, setMatchResult,
    pendingGarbage, setPendingGarbage, pendingGarbageRef,
    gameMode, setGameMode, gameModeRef,
    startTime, setStartTime, startTimeRef,
    elapsedTime, setElapsedTime,
    finalTime, setFinalTime,
    countdown, setCountdown, countdownRef, countdownTimeoutsRef,
    dropTime, setDropTime,
    gameOver, setGameOver,
    score, setScore,
    level, setLevel,
    lines, setLines,
    piecesPlaced, setPiecesPlaced,
    attackLines, setAttackLines
  };
};
