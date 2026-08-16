import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Cell } from '../utils/gameHelpers';
import { soundManager } from '../utils/soundManager';

type UseTouchControlsProps = {
  stageRef: MutableRefObject<Cell[][]>;
  tuningRef: MutableRefObject<{ arr: number; das: number; dcd: number; sdf: number; touchFlick?: boolean }>;
  gameOver: boolean;
  dropTime: number | null;
  appStateRef: MutableRefObject<string>;
  countdownRef: MutableRefObject<string | null>;
  movePlayerHorizontal: (dir: number, stage: Cell[][], isArrZero: boolean) => void;
  softDrop: () => void;
  hardDrop: () => void;
  playerRotate: (stage: Cell[][], dir: number) => void;
  playerHold?: (width: number, stage?: Cell[][]) => void;
  startGame?: () => void;
  quitGame?: () => void;
};

export const useTouchControls = ({
  stageRef, tuningRef, gameOver, dropTime, appStateRef, countdownRef,
  movePlayerHorizontal, softDrop, hardDrop, playerRotate
}: UseTouchControlsProps) => {
  const touchStartRef = useRef<{ x: number, y: number, time: number, fingers: number } | null>(null);
  const touchLastMoveRef = useRef<{ x: number, y: number } | null>(null);
  const horizontalAccumulator = useRef<number>(0);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (appStateRef.current !== 'PLAYING' && appStateRef.current !== 'ONLINE_1V1') return;
      if (tuningRef.current.touchFlick === false) return;
      if (gameOver || !dropTime || countdownRef.current === 'READY') return;

      if (e.target instanceof Node) {
        const el = e.target.nodeType === Node.TEXT_NODE ? e.target.parentElement : (e.target as Element);
        if (el && (el.closest('button') || el.closest('a') || el.closest('.hold-button'))) {
          return; // Don't block button taps
        }
      }
      
      e.preventDefault(); // Stop scrolling while playing

      const touch = e.touches[0];
      const fingers = e.touches.length;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now(), fingers };
      touchLastMoveRef.current = { x: touch.clientX, y: touch.clientY };
      horizontalAccumulator.current = 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || !touchLastMoveRef.current) return;
      if (tuningRef.current.touchFlick === false) return;
      
      e.preventDefault(); // Prevent scrolling
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchLastMoveRef.current.x;
      const deltaY = touch.clientY - touchLastMoveRef.current.y;
      
      // Move threshold
      const moveThreshold = 25;
      horizontalAccumulator.current += deltaX;
      
      if (Math.abs(horizontalAccumulator.current) > moveThreshold) {
        const dir = horizontalAccumulator.current > 0 ? 1 : -1;
        movePlayerHorizontal(dir, stageRef.current, false);
        soundManager.playSe('move');
        horizontalAccumulator.current -= dir * moveThreshold;
      }
      
      if (deltaY > moveThreshold) {
        softDrop();
        touchLastMoveRef.current.y = touch.clientY;
      }
      
      touchLastMoveRef.current.x = touch.clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      if (tuningRef.current.touchFlick === false) return;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - touchStartRef.current.x;
      const deltaY = endY - touchStartRef.current.y;
      const duration = Date.now() - touchStartRef.current.time;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (duration < 300) {
        if (absX < 15 && absY < 15) {
          // Tap (1-finger tap)
          const screenHalf = window.innerWidth / 2;
          if (endX > screenHalf) {
            playerRotate(stageRef.current, 1); // Right half: Rotate CW
          } else {
            playerRotate(stageRef.current, -1); // Left half: Rotate CCW
          }
          soundManager.playSe('rotate');
        } else if (absY > 30 && absY > absX) {
          // Flick Up or Down
          if (deltaY > 30) {
            // Flick Down (Hard Drop)
            hardDrop();
            soundManager.playSe('drop');
          } else if (deltaY < -30) {
            // Flick Up (180 Rotate)
            playerRotate(stageRef.current, 2);
            soundManager.playSe('rotate');
          }
        }
      }
      
      touchStartRef.current = null;
      touchLastMoveRef.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gameOver, dropTime, appStateRef, countdownRef, movePlayerHorizontal, softDrop, hardDrop, playerRotate, stageRef, tuningRef]);
};
