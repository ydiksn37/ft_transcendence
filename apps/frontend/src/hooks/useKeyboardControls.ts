import { useEffect, useCallback, useRef } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { Player } from './usePlayer';
import type { Cell } from '../utils/gameHelpers';
import type { Socket } from 'socket.io-client';

type UseKeyboardControlsProps = {
  player: Player;
  stageRef: MutableRefObject<Cell[][]>;
  tuningRef: MutableRefObject<{ arr: number; das: number; dcd: number; sdf: number }>;
  keyConfigRef: MutableRefObject<Record<string, string>>;
  gameOver: boolean;
  dropTime: number | null;
  appStateRef: MutableRefObject<'MENU' | 'CONFIG' | 'PLAYING' | 'RECORDS' | 'ONLINE_1V1' | 'CUSTOM_ROOMS'>;
  countdownRef: MutableRefObject<string | null>;
  listeningActionRef: MutableRefObject<string | null>;
  setKeyConfig: Dispatch<SetStateAction<Record<string, string>>>;
  setListeningAction: (action: string | null) => void;
  movePlayerHorizontal: (dir: number, stage: Cell[][], isArrZero: boolean) => void;
  softDrop: () => void;
  hardDrop: () => void;
  playerRotate: (stage: Cell[][], dir: number) => void;
  playerHold: (width: number) => void;
  startGame: (mode?: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1') => void;
  socketRef: MutableRefObject<Socket | null>;
  setSocket: (s: Socket | null) => void;
  setIsWaiting: (w: boolean) => void;
  setDropTime: (t: number | null) => void;
  quitGame: () => void;
};

export const useKeyboardControls = ({
  player, stageRef, tuningRef, keyConfigRef, gameOver, dropTime, appStateRef,
  countdownRef, listeningActionRef, setKeyConfig, setListeningAction,
  movePlayerHorizontal, softDrop, hardDrop, playerRotate, playerHold, startGame,
  socketRef, setSocket, setIsWaiting, setDropTime, quitGame
}: UseKeyboardControlsProps) => {
  const heldKeys = useRef<Set<string>>(new Set());
  const horizKeys = useRef<string[]>([]);
  const dasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const movePlayerRef = useRef(movePlayerHorizontal);
  useEffect(() => { movePlayerRef.current = movePlayerHorizontal; }, [movePlayerHorizontal]);

  const clearDASARR = useCallback(() => {
    if (dasTimerRef.current !== null) {
      clearTimeout(dasTimerRef.current);
      dasTimerRef.current = null;
    }
    if (arrTimerRef.current !== null) {
      clearInterval(arrTimerRef.current);
      arrTimerRef.current = null;
    }
  }, []);

  const getActiveDir = useCallback((): number | null => {
    if (horizKeys.current.length === 0) return null;
    const key = horizKeys.current[horizKeys.current.length - 1];
    return key === keyConfigRef.current.left ? -1 : 1;
  }, [keyConfigRef]);

  const startARR = useCallback(() => {
    if (arrTimerRef.current !== null) clearInterval(arrTimerRef.current);
    
    if (tuningRef.current.arr <= 0) {
      const dir = getActiveDir();
      if (dir !== null) movePlayerRef.current(dir, stageRef.current, true);
      
      arrTimerRef.current = setInterval(() => {
        const currentDir = getActiveDir();
        if (currentDir !== null) movePlayerRef.current(currentDir, stageRef.current, true);
      }, 10);
    } else {
      arrTimerRef.current = setInterval(() => {
        const dir = getActiveDir();
        if (dir !== null) movePlayerRef.current(dir, stageRef.current, false);
      }, tuningRef.current.arr);
    }
  }, [getActiveDir, tuningRef, stageRef]);

  const startDASARR = useCallback(() => {
    clearDASARR();
    dasTimerRef.current = setTimeout(() => {
      dasTimerRef.current = null;
      startARR();
    }, tuningRef.current.das);
  }, [clearDASARR, startARR, tuningRef]);

  useEffect(() => {
    if (gameOver || !dropTime) return;
    if (tuningRef.current.dcd > 0) {
      const dir = getActiveDir();
      if (dir !== null) {
        clearDASARR();
        setTimeout(() => {
          const currentDir = getActiveDir();
          if (currentDir !== null) {
            movePlayerRef.current(currentDir, stageRef.current, false);
            startARR();
          }
        }, tuningRef.current.dcd);
      }
    }
  }, [player.tetromino, gameOver, dropTime, clearDASARR, getActiveDir, startARR, tuningRef, stageRef]);

  useEffect(() => {
    if (gameOver || !dropTime) {
      clearDASARR();
      heldKeys.current.clear();
      horizKeys.current = [];
    }
  }, [gameOver, dropTime, clearDASARR]);

  useEffect(() => () => clearDASARR(), [clearDASARR]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const code = e.code;
      const conf = keyConfigRef.current;
      const listening = listeningActionRef.current;

      if (listening) {
        e.preventDefault();
        setKeyConfig(prev => ({ ...prev, [listening]: code }));
        setListeningAction(null);
        return;
      }

      if (appStateRef.current !== 'PLAYING' && appStateRef.current !== 'ONLINE_1V1' && appStateRef.current !== 'MENU') return;

      if (Object.values(conf).includes(code)) {
        e.preventDefault();
      }

      if (code === conf.restart) {
        if (!e.repeat) {
          if (appStateRef.current === 'MENU') {
            setDropTime(dropTime ? null : 1000);
          } else if (appStateRef.current !== 'ONLINE_1V1') {
            startGame();
          }
        }
        return;
      }

      if (code === 'Enter') {
        if (document.activeElement?.tagName === 'BUTTON') {
          return;
        }
        if (!e.repeat && appStateRef.current !== 'ONLINE_1V1' && appStateRef.current !== 'MENU') {
          startGame();
        }
        return;
      }

      if (code === conf.quitToMenu) {
        if (gameOver) return;
        if (!e.repeat) {
          if (socketRef.current) {
            socketRef.current.disconnect();
            setSocket(null);
          }
          setIsWaiting(false);
          setDropTime(null);
          quitGame();
        }
        return;
      }

      if (countdownRef.current === 'READY') return;
      if (gameOver || !dropTime) return;

      switch (code) {
        case conf.left:
        case conf.right: {
          const dir = code === conf.left ? -1 : 1;
          if (!heldKeys.current.has(code)) {
            heldKeys.current.add(code);
            horizKeys.current.push(code);
            movePlayerRef.current(dir, stageRef.current, false);
            startDASARR();
          }
          break;
        }
        case conf.softDrop:
          if (!heldKeys.current.has(conf.softDrop)) {
            heldKeys.current.add(conf.softDrop);
          }
          softDrop();
          break;
        case conf.hardDrop:
          if (!e.repeat) hardDrop();
          break;
        case conf.rotateCW:
          if (!e.repeat) playerRotate(stageRef.current, 1);
          break;
        case conf.rotateCCW:
          if (!e.repeat) playerRotate(stageRef.current, -1);
          break;
        case conf.rotate180:
          if (!e.repeat) playerRotate(stageRef.current, 2);
          break;
        case conf.hold:
          if (!e.repeat) playerHold(stageRef.current[0].length);
          break;
      }
    },
    [gameOver, dropTime, softDrop, hardDrop, playerRotate, stageRef, playerHold, startDASARR, startGame, keyConfigRef, listeningActionRef, setKeyConfig, setListeningAction, appStateRef, socketRef, setSocket, setIsWaiting, setDropTime, quitGame, countdownRef]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const code = e.code;
      const conf = keyConfigRef.current;

      if (code === conf.left || code === conf.right) {
        heldKeys.current.delete(code);
        const wasActive = horizKeys.current.length > 0 && horizKeys.current[horizKeys.current.length - 1] === code;
        horizKeys.current = horizKeys.current.filter(k => k !== code);
        
        if (wasActive) {
          clearDASARR();
          const dir = getActiveDir();
          if (dir !== null) {
            movePlayerRef.current(dir, stageRef.current, false);
            startDASARR();
          }
        }
      } else {
        heldKeys.current.delete(code);
      }
    },
    [clearDASARR, getActiveDir, startDASARR, keyConfigRef, stageRef]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);
  
  return { heldKeys };
};
