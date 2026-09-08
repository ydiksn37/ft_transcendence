import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CustomRoomsList } from '../components/UI/CustomRoomsList';
import { useAuth } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import { useGameState } from '../hooks/useGameState';
import { useInterval } from '../hooks/useInterval';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { useTouchControls } from '../hooks/useTouchControls';
import { useMultiplayer } from '../hooks/useMultiplayer';
import { usePlayer } from '../hooks/usePlayer';
import { useStage } from '../hooks/useStage';
import { calculateGhostY, checkCollision, createStage } from '../utils/gameHelpers';
import type { Cell } from '../utils/gameHelpers';
import { soundManager } from '../utils/soundManager';
import { resetTetrominoBag, setRandomSeed, TETROMINOS } from '../utils/tetrominos';
import { TetrisUI } from '../components/UI/TetrisUI';
import { isAiDifficulty, ClientEvent, TETROMINO_SHAPES, type GameState } from '@transcendence/shared';

/** Drop interval for a given level using standard Guideline formula */
const levelDropTime = (level: number) => {
  const base = Math.max(0, 0.8 - ((level - 1) * 0.007));
  return Math.pow(base, level - 1) * 1000;
};

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};



const PlayPage = () => {
  const { mode } = useParams<{ mode: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1' | 'CUSTOM_ROOMS' | 'VS_AI' }>();
  const location = useLocation();
  const serverMatch = mode === 'ONLINE_1V1' || mode === 'CUSTOM_ROOMS';
  const [serverState, setServerState] = useState<(GameState & { piecesPlaced?: number; attacksSent?: number }) | null>(null);
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const initialLevel = parseInt(queryParams.get('level') || '1', 10);
  const requestedAiDifficulty = (queryParams.get('difficulty') || 'EASY').toUpperCase();
  const aiDifficulty = isAiDifficulty(requestedAiDifficulty)
    ? requestedAiDifficulty
    : 'EASY';
  const requestedAiSpeedMs = Number(queryParams.get('aiSpeedMs') ?? 50);
  const aiActionDelayMs = Number.isFinite(requestedAiSpeedMs)
    ? Math.max(0, Math.min(1000, Math.trunc(requestedAiSpeedMs)))
    : 50;
  const {
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
    gameMode, gameModeRef, setGameMode,
    setStartTime, startTimeRef,
    elapsedTime, setElapsedTime,
    finalTime, setFinalTime,
    countdown, setCountdown, countdownRef, countdownTimeoutsRef,
    dropTime, setDropTime,
    gameOver, setGameOver, gameOverRef,
    score, setScore,
    level, setLevel,
    lines, setLines,
    piecesPlaced, setPiecesPlaced,
    attackLines, setAttackLines
  } = useGameState();

  const { token } = useAuth();

  const [player, updatePlayerPos, resetPlayer, playerRotate, playerHold, holdInfo, resetHold, nextPieceKeys, movePlayerHorizontal, setPlayer] = usePlayer();

  const checkGameOver = useCallback((newStage: Cell[][], isLockOut: boolean = false) => {
     if (isLockOut) {
       setGameOver(true);
       setDropTime(null);
       if (gameModeRef.current === 'ONLINE_1V1') {
         setMatchResult('LOSE');
       }
       return true;
     }

     if (!nextPieceKeys || nextPieceKeys.length === 0) return false;
     const nextPiece = TETROMINOS[nextPieceKeys[0] as keyof typeof TETROMINOS].shape;
     const dummyPlayer = {
       pos: { x: Math.floor(newStage[0].length / 2) - Math.ceil(nextPiece[0].length / 2), y: 17 }, // 1マス上にスポーンテスト
       tetromino: nextPiece,
       collided: false,
       rotationIndex: 0,
       spawnCount: 0
     };
     if (checkCollision(dummyPlayer, newStage, { x: 0, y: 0 })) {
       setGameOver(true);
       setDropTime(null);
       if (gameModeRef.current === 'ONLINE_1V1') {
         setMatchResult('LOSE');
       }
       return true;
     }
     return false;
  }, [nextPieceKeys]);

  const [stage, setStage, lockEvent, stageRef] = useStage(player, resetPlayer, checkGameOver);

  const { keyConfig, setKeyConfig, keyConfigRef, tuningRef, setListeningAction } = useConfig();
  const listeningActionRef = useRef<string | null>(null);

  // ── Score / Level / Speed ───────────────────────────────────────────────
  const b2bRef = useRef(false);
  const comboRef = useRef(-1);
  const levelPointsRef = useRef(0);
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionText, setActionText] = useState<string | null>(null);

  const lastProcessedEventIdRef = useRef(-1);
  const initializeRouteRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!lockEvent || lockEvent.id === lastProcessedEventIdRef.current) return;
    lastProcessedEventIdRef.current = lockEvent.id;
    
    setPiecesPlaced(prev => prev + 1);

    const { lines, tSpinType, perfectClear } = lockEvent;
    
    if (lines > 0) {
      comboRef.current += 1;
      if (lines === 4) {
        soundManager.playSe('tetris');
      } else {
        soundManager.playSe('clear');
      }
    } else {
      comboRef.current = -1;
    }
    
    const isDifficult = lines === 4 || tSpinType !== 'none';
    
    let isB2B = false;
    if (lines > 0) {
      if (isDifficult) {
        if (b2bRef.current) isB2B = true;
        b2bRef.current = true;
      } else {
        b2bRef.current = false;
      }
    }
    
    let actionName = '';
    let baseScore = 0;
    
    if (tSpinType === 't-spin') {
      if (lines === 0) { actionName = 'T-Spin'; baseScore = 400; }
      else if (lines === 1) { actionName = 'T-Spin Single'; baseScore = 800; }
      else if (lines === 2) { actionName = 'T-Spin Double'; baseScore = 1200; }
      else if (lines === 3) { actionName = 'T-Spin Triple'; baseScore = 1600; }
    } else if (tSpinType === 'mini-t-spin') {
      if (lines === 0) { actionName = 'T-Spin Mini'; baseScore = 100; }
      else if (lines === 1) { actionName = 'T-Spin Mini Single'; baseScore = 200; }
      else if (lines === 2) { actionName = 'T-Spin Mini Double'; baseScore = 400; }
    } else {
      if (lines === 1) { actionName = 'Single'; baseScore = 100; }
      else if (lines === 2) { actionName = 'Double'; baseScore = 300; }
      else if (lines === 3) { actionName = 'Triple'; baseScore = 500; }
      else if (lines === 4) { actionName = 'Tetris'; baseScore = 800; }
    }
    
    if (isB2B && lines > 0) {
      actionName = 'B2B ' + actionName;
      baseScore = Math.floor(baseScore * 1.5);
    }
    
    if (perfectClear) {
      actionName = 'Perfect Clear!' + (actionName ? '\n' + actionName : '');
      if (lines === 1) baseScore += 800;
      else if (lines === 2) baseScore += 1200;
      else if (lines === 3) baseScore += 1800;
      else if (lines === 4) baseScore += 2000;
    }
    
    let comboScore = 0;
    if (comboRef.current > 0) {
      actionName += (actionName ? '\n' : '') + `${comboRef.current} Combo`;
      comboScore = 50 * comboRef.current * level;
    }
    
    const totalScore = (baseScore * level) + comboScore;
    
    if (totalScore > 0) {
       setScore(prev => prev + totalScore);
    }

    // Official Variable Goal Leveling
    let levelPts = 0;
    if (tSpinType === 't-spin') {
      if (lines === 0) levelPts = 2;
      else if (lines === 1) levelPts = 2;
      else if (lines === 2) levelPts = 4;
      else if (lines === 3) levelPts = 6;
    } else if (tSpinType === 'mini-t-spin') {
      levelPts = 1;
    } else {
      if (lines === 1) levelPts = 1;
      else if (lines === 2) levelPts = 3;
      else if (lines === 3) levelPts = 5;
      else if (lines === 4) levelPts = 8;
    }
    if (isB2B && lines > 0) {
      levelPts = Math.floor(levelPts * 1.5);
    }
    levelPointsRef.current += levelPts;

    const calculatedLevel = Math.max(1, Math.floor((1 + Math.sqrt(1 + 8 * (levelPointsRef.current / 5))) / 2));
    
    setLevel(prevLevel => {
       if (calculatedLevel > prevLevel) {
          setDropTime(levelDropTime(calculatedLevel));
          return calculatedLevel;
       }
       return prevLevel;
    });

    if (lines > 0) {
       setLines(prev => {
          const newLines = prev + lines;
          
          if (gameModeRef.current === '40_LINES' && newLines >= 40) {
             const timeTaken = Date.now() - startTimeRef.current!;
             setFinalTime(timeTaken);
             setGameOver(true);
             setDropTime(null);
             
             return newLines;
          }

          const newLevel = Math.floor(newLines / 10) + initialLevel;
          setLevel(newLevel);
          setDropTime(levelDropTime(newLevel));
          return newLines;
       });
    }
     
     // Garbage Lines Logic
     let generatedGarbage = 0;
     if (tSpinType === 't-spin') {
       if (lines === 1) generatedGarbage = 2;
       else if (lines === 2) generatedGarbage = 4;
       else if (lines === 3) generatedGarbage = 6;
     } else if (tSpinType === 'mini-t-spin') {
       if (lines === 1) generatedGarbage = 1;
       else if (lines === 2) generatedGarbage = 1;
     } else {
       if (lines === 2) generatedGarbage = 1;
       else if (lines === 3) generatedGarbage = 2;
       else if (lines === 4) generatedGarbage = 4;
     }

     if (isB2B && lines > 0) generatedGarbage += 1;
     if (perfectClear) generatedGarbage += 10;
     
     if (comboRef.current > 0) {
        generatedGarbage += Math.floor((comboRef.current + 1) / 2);
     }

     if (generatedGarbage > 0) {
        setAttackLines(prev => prev + generatedGarbage);
     }

     if (gameModeRef.current === 'ONLINE_1V1') {
        let remainingAttacks = [...pendingGarbageRef.current];
        const originalGeneratedGarbage = generatedGarbage;
        
        if (generatedGarbage > 0) {
           while (remainingAttacks.length > 0 && generatedGarbage > 0) {
              if (generatedGarbage >= remainingAttacks[0]) {
                 generatedGarbage -= remainingAttacks[0];
                 remainingAttacks.shift();
              } else {
                 remainingAttacks[0] -= generatedGarbage;
                 generatedGarbage = 0;
              }
           }
        }
        if (originalGeneratedGarbage > 0 && socketRef.current) {
           socketRef.current.emit('send_garbage', { lines: generatedGarbage, generated: originalGeneratedGarbage });
        }


        if (lines === 0 && remainingAttacks.length > 0) {
           const linesToAdd = remainingAttacks.reduce((a, b) => a + b, 0);
           const newStage = [...stageRef.current];
           const width = newStage[0].length;
           
           let isPushedOut = false;
           for (let i = 0; i < linesToAdd; i++) {
               if (newStage[i] && newStage[i].some(cell => cell[1] === 'merged')) {
                   isPushedOut = true;
                   break;
               }
           }
           
           newStage.splice(0, linesToAdd);
           
           for (const attackLines of remainingAttacks) {
              const hole = Math.floor(Math.random() * width);
              for (let i = 0; i < attackLines; i++) {
                 const newRow = Array.from({ length: width }, (_, colIndex) => 
                   colIndex === hole ? [0, 'clear'] : ['X', 'merged']
                 ) as Cell[];
                 newStage.push(newRow);
              }
           }
           
           stageRef.current = newStage;
           setStage(newStage);


           
           remainingAttacks = [];
           
           if (isPushedOut || checkCollision(player, newStage, { x: 0, y: 0 })) {
             setGameOver(true);
             if (gameModeRef.current === 'ONLINE_1V1') {
               setMatchResult('LOSE');
             }
             setDropTime(null);
           }
        }
        
        pendingGarbageRef.current = remainingAttacks;
        setPendingGarbage(remainingAttacks);
     }

    if (actionName && (isDifficult || comboRef.current > 0 || (tSpinType !== 'none' && lines === 0) || perfectClear)) {
       // Clear old text immediately to restart the animation if the same text is set again
       setActionText(null);
       
       if (actionTimeoutRef.current) {
         clearTimeout(actionTimeoutRef.current);
       }
       
       // Use a tiny timeout to ensure React flushes the null state and restarts the CSS animation
       setTimeout(() => {
         setActionText(actionName);
         actionTimeoutRef.current = setTimeout(() => setActionText(null), 2000);
       }, 0);
    }
  }, [lockEvent, setScore, setLines, level, setFinalTime, setGameOver, setDropTime, setPiecesPlaced, setOpponentStage, setMatchResult]);

  // Sprint Record Submission Effect
  useEffect(() => {
    if (gameOver && finalTime && gameModeRef.current === '40_LINES') {
      if (token) {
        fetch(`/api/sprint`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            timeMs: finalTime,
            lines: 40,
            pieces: piecesPlaced
          })
        }).catch(err => console.error('Failed to save sprint record:', err));
      }
    }
  }, [gameOver, finalTime, token, piecesPlaced]);

  // General Game Result Submission Effect
  useEffect(() => {
    if (gameOver && (gameModeRef.current === '40_LINES' || gameModeRef.current === 'MARATHON')) {
      if (token) {
        const durationSeconds = elapsedTime / 1000;
        const durationMinutes = durationSeconds / 60;
        const apm = durationMinutes > 0 ? attackLines / durationMinutes : 0;
        const pps = durationMinutes > 0 ? piecesPlaced / (durationMinutes * 60) : 0;

        fetch(`/api/game/result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            gameMode: gameModeRef.current,
            apm: Math.round(apm * 10) / 10,
            pps: Math.round(pps * 100) / 100,
            linesCleared: lines,
            tSpins: 0, 
            tetrises: 0, 
            durationSeconds: Math.floor(durationSeconds),
            score: score
          })
        }).catch(err => console.error('Failed to save game result:', err));
      }
    }
  }, [gameOver, token, piecesPlaced, attackLines, elapsedTime, lines, score]);

  // ── Lock Delay (遊び時間) ────────────────────────────────────────────────
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerRef = useRef(player);
  useEffect(() => { playerRef.current = player; }, [player]);

  const lowestYRef = useRef(0);
  const lockResetCountRef = useRef(0);
  const currentSpawnCountRef = useRef(0);
  const lastIncrementedPlayerRef = useRef<typeof player | null>(null);

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
  }, []);

  const lockPiece = useCallback(() => {
    updatePlayerPos({ x: 0, y: 0, collided: true });
  }, [updatePlayerPos]);

  const startLockTimer = useCallback(() => {
    clearLockTimer();
    lockTimerRef.current = setTimeout(() => {
      lockPiece();
    }, 500); // 500ms lock delay
  }, [clearLockTimer, lockPiece]);

  // Start or clear lock timer based on ground collision
  useEffect(() => {
    if (serverMatch || gameOver || player.collided || !dropTime) {
      clearLockTimer();
      return;
    }

    // 1. Check for spawn or new lowest Y
    if (player.spawnCount !== currentSpawnCountRef.current) {
      currentSpawnCountRef.current = player.spawnCount;
      lowestYRef.current = player.pos.y;
      lockResetCountRef.current = 0;
    } else if (player.pos.y > lowestYRef.current) {
      lowestYRef.current = player.pos.y;
      lockResetCountRef.current = 0;
    }

    // 2. Check collision
    const isTouchingFloor = checkCollision(player, stage, { x: 0, y: 1 });

    if (isTouchingFloor) {
      if (!lockTimerRef.current) {
        // Just touched the floor
        if (lockResetCountRef.current >= 15) {
          lockPiece(); // Instant lock if out of resets
        } else {
          startLockTimer();
        }
      } else {
        // Already on the floor, piece moved or rotated
        if (lastIncrementedPlayerRef.current !== player) {
          lastIncrementedPlayerRef.current = player;
          if (lockResetCountRef.current < 15) {
            lockResetCountRef.current++;
            startLockTimer();
          } else {
            // Reached limit, do not reset timer (let existing timer run out)
          }
        }
      }
    } else {
      clearLockTimer();
    }
  }, [serverMatch, player, stage, gameOver, dropTime, startLockTimer, clearLockTimer, lockPiece]);



  const drop = useCallback(() => {
    setPlayer(prev => {
      if (!checkCollision(prev, stageRef.current, { x: 0, y: 1 })) {
        return {
          ...prev,
          pos: { x: prev.pos.x, y: prev.pos.y + 1 },
          collided: false,
          lastAction: 'drop',
        };
      }
      return prev;
    });
    // Lock delay is handled by the useEffect watching player position.
  }, [stageRef, setPlayer]);

  const softDrop = useCallback(() => {
    const sdf = tuningRef.current.sdf;
    
    setPlayer(prev => {
      if (sdf === 0) {
        const ghostY = calculateGhostY(prev, stageRef.current);
        const dist = ghostY - prev.pos.y;
        if (dist > 0) {
          setScore(s => s + dist);
          return {
            ...prev,
            pos: { x: prev.pos.x, y: ghostY },
            collided: false,
            lastAction: 'drop',
          };
        }
      } else {
        let dropped = 0;
        for (let i = 0; i < sdf; i++) {
          if (!checkCollision(prev, stageRef.current, { x: 0, y: dropped + 1 })) {
            dropped++;
          } else {
            break;
          }
        }
        if (dropped > 0) {
          setScore(s => s + dropped);
          return {
            ...prev,
            pos: { x: prev.pos.x, y: prev.pos.y + dropped },
            collided: false,
            lastAction: 'drop',
          };
        }
      }
      return prev;
    });
  }, [stageRef, setPlayer]);

  // Automatically apply soft drop if softDrop key is held and the piece moves/rotates/spawns
  useEffect(() => {
    if (serverMatch || gameOver || !dropTime) return;
    if (heldKeys.current.has(keyConfig.softDrop)) {
      softDrop();
    }
  }, [serverMatch, player.pos.x, player.rotationIndex, player.tetromino, gameOver, dropTime, softDrop, keyConfig.softDrop]);

  /** Hard drop: instantly land the piece at ghost position (+2 pts/row) */
  const hardDrop = useCallback(() => {
    clearLockTimer();
    setPlayer(prev => {
      const ghostY = calculateGhostY(prev, stageRef.current);
      const dist = ghostY - prev.pos.y;

      if (dist > 0) {
        setScore(s => s + dist * 2);
      }

      return {
        ...prev,
        pos: { x: prev.pos.x, y: ghostY },
        collided: true,
        lastAction: dist > 0 ? 'drop' : prev.lastAction,
      };
    });
  }, [stageRef, setPlayer, clearLockTimer]);



  // ── Game control ────────────────────────────────────────────────────────
  const startGame = useCallback((mode?: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1') => {
    countdownTimeoutsRef.current.forEach(clearTimeout);
    countdownTimeoutsRef.current = [];
    setCountdown('READY');

    const nextMode = mode || gameModeRef.current;
    if (nextMode !== gameModeRef.current) {
      setGameMode(nextMode);
    }
    
    setStartTime(null);
    startTimeRef.current = null;
    setElapsedTime(0);
    setFinalTime(null);
    
    const newStage = createStage(nextMode === '4_WIDE' ? 4 : 10);
    if (nextMode === '4_WIDE') {
      // Board width is 4. Place 3 blocks on the bottom row (y=39).
      for (let x = 0; x < 3; x++) newStage[39][x] = ['X', 'merged'];
    }
    setStage(newStage);
    stageRef.current = newStage;
    
    setDropTime(null);
    if (nextMode !== 'ONLINE_1V1') {
      setRandomSeed(null);
    }
    resetTetrominoBag();
    resetPlayer(nextMode === '4_WIDE' ? 4 : 10, stageRef.current);
    resetHold();
    setGameOver(false);
    setMatchResult(null);
    setOpponentStage(null);
    setOpponentScore(0);
    setPendingGarbage([]);
    pendingGarbageRef.current = [];
    setScore(0);
    setLevel(initialLevel);
    setLines(0);
    setPiecesPlaced(0);
    setAttackLines(0);
    comboRef.current = -1;
    b2bRef.current = false;
    levelPointsRef.current = 0;
    setActionText(null);
    if (nextMode !== 'ONLINE_1V1') {
      setAppState('PLAYING');
    } else {
      setAppState('ONLINE_1V1');
      setIsWaiting(false);
    }

    const t1 = setTimeout(() => {
      setCountdown('GO!');
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
      setDropTime(levelDropTime(initialLevel));
    }, 1000);

    const t2 = setTimeout(() => {
      setCountdown(null);
    }, 2000);

    countdownTimeoutsRef.current = [t1, t2];
  }, [setStage, resetPlayer, resetHold, stageRef]);

  // Handle Game Over sound and stop BGM
  useEffect(() => {
    if (gameOver) {
      soundManager.playSe('gameover');
      soundManager.stopBgm();
    }
  }, [gameOver]);

  // Handle BGM starting
  useEffect(() => {
    if (appState === 'PLAYING' || appState === 'ONLINE_1V1') {
      if (!gameOver && countdown === null) {
        soundManager.playBgm('/bgm.mp3'); // Fallback placeholder path
      }
    }
    return () => {
      soundManager.stopBgm();
    };
  }, [appState, gameOver, countdown]);

  const { joinOnline, setupCustomRoomConnection, startVsAi, customRoomIsPlaying } = useMultiplayer({
    setServerState, setStartTime,
    appState, appStateRef, gameOverRef, setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold,
    setScore, setLevel, setLines, gameOver, setGameOver, setDropTime, startGame,
    stage, score, nextPieceKeys, holdInfo, socket, setSocket, socketRef, isWaiting, setIsWaiting, setConnectionError,
    setOpponentStage, setOpponentScore, setOpponentNextPieceKeys, setOpponentHoldMino, setOpponents,
    matchResult, setMatchResult, setPendingGarbage, pendingGarbageRef, token
  });

  const quitGame = useCallback(() => {
    // ゲーム中にQUITした場合は game_over をサーバーに送信して相手に勝利判定を与える
    // （ESCキーで disconnect するのと同じ挙動にする）
    if (socketRef.current && !gameOver && appState === 'ONLINE_1V1') {
      socketRef.current.emit('game_over');
      socketRef.current.disconnect();
      setSocket(null);
    }

    if (mode === 'CUSTOM_ROOMS' && socketRef.current) {
      setAppState('CUSTOM_ROOMS');
    } else {
      navigate(`/lobby/${mode}`);
    }
  }, [mode, navigate, setAppState, socketRef, setSocket, gameOver, appState]);

  initializeRouteRef.current = () => {
    if (!mode) return;
    if (mode === 'ONLINE_1V1') {
      joinOnline();
    } else if (mode === 'CUSTOM_ROOMS') {
      setupCustomRoomConnection();
    } else if (mode === 'VS_AI') {
      startVsAi(aiDifficulty, aiActionDelayMs);
    } else {
      startGame(mode);
    }
  };

  useEffect(() => {
    initializeRouteRef.current?.();

    // StrictModeの setup -> cleanup -> setup でも古い接続を残さない。
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [mode, location.search, socketRef]);


  // ── DAS / ARR keyboard handling ─────────────────────────────────────────────────────
  const sendInput = (event: string, count = 1) => {
    if (appStateRef.current !== 'ONLINE_1V1' || gameOverRef.current || !serverState || serverState.isGameOver) return;
    for (let i = 0; i < count; ++i) socketRef.current?.emit(event);
  };
  const controls = serverMatch ? {
    movePlayerHorizontal: (dir: number, _stage: Cell[][], instant: boolean) =>
      sendInput(dir < 0 ? ClientEvent.MOVE_LEFT : ClientEvent.MOVE_RIGHT, instant ? 10 : 1),
    softDrop: () => {
      // Do not flood the server while grounded. The held-key timer uses the
      // latest snapshot, so a successful sideways move re-enables dropping.
      if (!serverState || serverState.activeMino.y >= serverState.ghostY) return;
      sendInput(ClientEvent.SOFT_DROP, tuningRef.current.sdf === 0 ? 40 : Math.max(1, Math.min(40, tuningRef.current.sdf)));
    },
    hardDrop: () => sendInput(ClientEvent.HARD_DROP),
    playerRotate: (_stage: Cell[][], dir: number) => sendInput(dir === 2 ? ClientEvent.ROTATE_180 : dir < 0 ? ClientEvent.ROTATE_CCW : ClientEvent.ROTATE_CW),
    playerHold: () => sendInput(ClientEvent.HOLD),
  } : { movePlayerHorizontal, softDrop, hardDrop, playerRotate, playerHold };
  const { heldKeys } = useKeyboardControls({
    player, stageRef, tuningRef, keyConfigRef, gameOver, dropTime, appStateRef,
    countdownRef, listeningActionRef, setKeyConfig, setListeningAction: setListeningAction as any,
    ...controls, startGame,
    socketRef, setSocket, setIsWaiting, setDropTime, quitGame
  });

  useTouchControls({
    stageRef, tuningRef, gameOver, dropTime, appStateRef, countdownRef,
    ...controls,
    startGame, quitGame: () => {
      if (mode === 'CUSTOM_ROOMS' && socketRef.current) {
        setAppState('CUSTOM_ROOMS');
      } else {
        navigate(`/lobby/${mode}`);
      }
    }
  });

  // Auto-drop (gravity)
  useInterval(drop, serverMatch ? null : dropTime);

  // ── Render (original UI + score/level/lines added) ──────────────────────

  if (appState === 'CUSTOM_ROOMS') {
    return <CustomRoomsList socket={socket} setAppState={setAppState as any} onBack={() => navigate('/lobby/MULTI_PLAY')} />;
  }

  // Prevent flashing the wrong mode's board on first render before useEffect triggers
  if (appState === 'MENU') {
    return <div style={{ backgroundColor: '#111', width: '100vw', height: '100vh' }} />;
  }

  const shownStage: Cell[][] = serverMatch
    ? (serverState?.board.map(row => row.map(cell => [cell === 'GARBAGE' ? 'X' : cell ?? 0, cell === null ? 'clear' : 'merged'] as Cell)) ?? createStage(10))
    : stage;
  let shownPlayer = player;
  if (serverMatch) {
    const active = serverState?.activeMino;
    const size = active?.type === 'I' ? 4 : active?.type === 'O' ? 2 : 3;
    const matrix: (string | number)[][] = Array.from({ length: size }, () => Array(size).fill(0));
    if (active && !serverState?.isGameOver)
      for (const [r, c] of TETROMINO_SHAPES[active.type][active.rotation]) matrix[r][c] = active.type;
    shownPlayer = { pos: { x: active?.x ?? 3, y: active?.y ?? 18 }, tetromino: matrix,
      collided: false, rotationIndex: active?.rotation ?? 0, spawnCount: 0 };
  }
  return (
    <TetrisUI
      stage={shownStage}
      player={shownPlayer}
      ghostYOverride={serverMatch ? serverState?.ghostY : undefined}
      gameOver={gameOver}
      gameMode={gameMode}
      score={serverMatch ? serverState?.score ?? 0 : score}
      level={serverMatch ? serverState?.level ?? 1 : level}
      lines={serverMatch ? serverState?.lines ?? 0 : lines}
      nextPieceKeys={serverMatch ? serverState?.nextMinos ?? [] : nextPieceKeys}
      holdInfo={serverMatch ? { tetromino: serverState?.holdMino ?? null, hasHeld: !(serverState?.canHold ?? true) } : holdInfo}
      isWaiting={isWaiting}
      connectionError={connectionError}
      matchResult={matchResult}
      opponentStage={opponentStage}
      opponentScore={opponentScore}
      opponentNextPieceKeys={opponentNextPieceKeys}
      opponentHoldMino={opponentHoldMino}
      opponents={opponents}
      pendingGarbage={serverMatch ? [serverState?.garbageQueue ?? 0] : pendingGarbage}
      actionText={actionText}
      countdown={serverMatch ? (!serverState && !isWaiting ? 'READY' : null) : countdown}
      finalTime={finalTime}
      elapsedTime={elapsedTime}
      piecesPlaced={serverMatch ? serverState?.piecesPlaced ?? 0 : piecesPlaced}
      attackLines={serverMatch ? serverState?.attacksSent ?? 0 : attackLines}
      socketRef={socketRef}
      setSocket={setSocket}
      setIsWaiting={setIsWaiting}
      setDropTime={setDropTime}
      formatTime={formatTime}
      createStage={createStage}
      appState={appState}
      restartGame={() => startGame()}
      joinOnline={mode === 'VS_AI' ? () => startVsAi(aiDifficulty, aiActionDelayMs) : joinOnline}
      isCustomRoom={mode === 'CUSTOM_ROOMS'}
      isVsAi={mode === 'VS_AI'}
      onlineRestartLabel={mode === 'VS_AI' ? 'REMATCH (ENTER)' : undefined}
      quitGame={quitGame}
      onQuit={quitGame}
      onSpectate={customRoomIsPlaying ? () => socketRef.current?.emit('room:spectate', {}) : undefined}
      onHold={() => controls.playerHold(stage[0].length, stage)}
    />
  );
};

export default PlayPage;
