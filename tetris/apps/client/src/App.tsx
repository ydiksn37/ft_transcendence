import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlayer } from './hooks/usePlayer';
import { useStage } from './hooks/useStage';
import { useInterval } from './hooks/useInterval';
import { createStage, checkCollision, calculateGhostY, type Cell } from './utils/gameHelpers';
import { resetTetrominoBag, TETROMINOS, setRandomSeed } from './utils/tetrominos';
import { Menu } from './components/UI/Menu';
import { Records } from './components/UI/Records';
import { Config } from './components/UI/Config';
import { TetrisUI } from './components/UI/TetrisUI';
import { useConfig } from './hooks/useConfig';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useMultiplayer } from './hooks/useMultiplayer';
import { useGameState } from './hooks/useGameState';

/** Drop interval for a given level (min 80 ms) */
const levelDropTime = (level: number) => Math.max(80, 1000 - (level - 1) * 90);

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

const App = () => {
  const {
    appState, setAppState, appStateRef,
    socket, setSocket, socketRef,
    isWaiting, setIsWaiting,
    opponentStage, setOpponentStage,
    opponentScore, setOpponentScore,
    matchResult, setMatchResult,
    pendingGarbage, setPendingGarbage, pendingGarbageRef,
    gameMode, setGameMode, gameModeRef,
    records, setRecords,
    setStartTime, startTimeRef,
    elapsedTime, setElapsedTime,
    finalTime, setFinalTime,
    countdown, setCountdown, countdownRef, countdownTimeoutsRef,
    dropTime, setDropTime,
    gameOver, setGameOver,
    score, setScore,
    level, setLevel,
    lines, setLines
  } = useGameState();

  const [player, updatePlayerPos, resetPlayer, playerRotate, playerHold, holdInfo, resetHold, nextPieceKeys, movePlayerHorizontal, setPlayer] = usePlayer();

  const checkGameOver = useCallback((newStage: Cell[][]) => {
     if (!nextPieceKeys || nextPieceKeys.length === 0) return false;
     const nextPiece = TETROMINOS[nextPieceKeys[0] as keyof typeof TETROMINOS].shape;
     const dummyPlayer = {
       pos: { x: Math.floor(newStage[0].length / 2) - Math.ceil(nextPiece[0].length / 2), y: 0 },
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

  const {
    tuning, setTuning, tuningRef,
    keyConfig, setKeyConfig, keyConfigRef,
    listeningAction, setListeningAction, listeningActionRef
  } = useConfig();

  // ── Score / Level / Speed ───────────────────────────────────────────────
  const b2bRef = useRef(false);
  const comboRef = useRef(-1);
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionText, setActionText] = useState<string | null>(null);

  const lastProcessedEventIdRef = useRef(-1);

  useEffect(() => {
    if (!lockEvent || lockEvent.id === lastProcessedEventIdRef.current) return;
    lastProcessedEventIdRef.current = lockEvent.id;

    const { lines, tSpinType, perfectClear } = lockEvent;
    
    if (lines > 0) {
      comboRef.current += 1;
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
    
    if (lines > 0) {
       setLines(prev => {
          const newLines = prev + lines;
          
          if (gameModeRef.current === '40_LINES' && newLines >= 40) {
             const timeTaken = Date.now() - startTimeRef.current!;
             setFinalTime(timeTaken);
             setGameOver(true);
             setDropTime(null);
             
             setRecords(prevRecs => {
               const newRecs = [...prevRecs, timeTaken].sort((a, b) => a - b).slice(0, 10);
               localStorage.setItem('tetris40LinesRecords', JSON.stringify(newRecs));
               return newRecs;
             });
             return newLines;
          }

          const newLevel = Math.floor(newLines / 10) + 1;
          setLevel(newLevel);
          setDropTime(levelDropTime(newLevel));
          return newLines;
       });
    }
     
     // Garbage Lines Logic
     if (gameModeRef.current === 'ONLINE_1V1') {
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

        let remainingAttacks = [...pendingGarbageRef.current];
        
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
           if (generatedGarbage > 0 && socketRef.current) {
              socketRef.current.emit('send_garbage', { lines: generatedGarbage });
           }
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
           
           setPlayer(p => {
             const newY = Math.max(0, p.pos.y - linesToAdd);
             return { ...p, pos: { ...p.pos, y: newY } };
           });
           
           remainingAttacks = [];
           
           if (isPushedOut || newStage[0].some(cell => cell[1] === 'merged')) {
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
  }, [lockEvent, level]);

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
    if (gameOver || player.collided || !dropTime) {
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
  }, [player, stage, gameOver, dropTime, startLockTimer, clearLockTimer, lockPiece]);



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
    if (gameOver || !dropTime) return;
    if (heldKeys.current.has(keyConfig.softDrop)) {
      softDrop();
    }
  }, [player.pos.x, player.rotationIndex, player.tetromino, gameOver, dropTime, softDrop, keyConfig.softDrop]);

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
    setGameMode(nextMode);
    
    setStartTime(null);
    startTimeRef.current = null;
    setElapsedTime(0);
    setFinalTime(null);
    
    const newStage = createStage(nextMode === '4_WIDE' ? 4 : 10);
    if (nextMode === '4_WIDE') {
      // Board width is 4. Place 3 blocks on the bottom row (row 21).
      for (let x = 0; x < 3; x++) newStage[21][x] = ['X', 'merged'];
    }
    setStage(newStage);
    stageRef.current = newStage;
    
    setDropTime(null);
    if (nextMode !== 'ONLINE_1V1') {
      setRandomSeed(null);
    }
    resetTetrominoBag();
    resetPlayer(nextMode === '4_WIDE' ? 4 : 10);
    resetHold();
    setGameOver(false);
    setMatchResult(null);
    setPendingGarbage([]);
    pendingGarbageRef.current = [];
    setScore(0);
    setLevel(1);
    setLines(0);
    comboRef.current = -1;
    b2bRef.current = false;
    setActionText(null);
    if (nextMode !== 'ONLINE_1V1') {
      setAppState('PLAYING');
    } else {
      setIsWaiting(false);
    }

    const t1 = setTimeout(() => {
      setCountdown('GO!');
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
      setDropTime(levelDropTime(1));
    }, 1000);

    const t2 = setTimeout(() => {
      setCountdown(null);
    }, 2000);

    countdownTimeoutsRef.current = [t1, t2];
  }, [setStage, resetPlayer, resetHold, stageRef]);

  const { joinOnline } = useMultiplayer({
    appState, setAppState, setGameMode, setStage, stageRef, resetPlayer, resetHold,
    setScore, setLevel, setLines, gameOver, setGameOver, setDropTime, startGame,
    stage, score, socket, setSocket, isWaiting, setIsWaiting,
    setOpponentStage, setOpponentScore,
    matchResult, setMatchResult, setPendingGarbage, pendingGarbageRef
  });

  // ── DAS / ARR keyboard handling ─────────────────────────────────────────────────────
  const { heldKeys } = useKeyboardControls({
    player, stageRef, tuningRef, keyConfigRef, gameOver, dropTime, appStateRef,
    countdownRef, listeningActionRef, setKeyConfig, setListeningAction: setListeningAction as any,
    movePlayerHorizontal, softDrop, hardDrop, playerRotate, playerHold, startGame,
    socketRef, setSocket, setIsWaiting, setDropTime, setAppState
  });

  // Auto-drop (gravity)
  useInterval(drop, dropTime);

  // ── Render (original UI + score/level/lines added) ──────────────────────
  if (appState === 'MENU') {
    return <Menu startGame={startGame} joinOnline={joinOnline} setAppState={setAppState} />;
  }

  if (appState === 'RECORDS') {
    return <Records records={records} setAppState={setAppState} />;
  }

  if (appState === 'CONFIG') {
    return (
      <Config
        tuning={tuning}
        setTuning={setTuning}
        keyConfig={keyConfig}
        listeningAction={listeningAction}
        setListeningAction={setListeningAction as any}
        setAppState={setAppState}
      />
    );
  }

  return (
    <TetrisUI
      stage={stage}
      player={player}
      gameOver={gameOver}
      gameMode={gameMode}
      score={score}
      level={level}
      lines={lines}
      nextPieceKeys={nextPieceKeys}
      holdInfo={holdInfo}
      isWaiting={isWaiting}
      matchResult={matchResult}
      opponentStage={opponentStage}
      opponentScore={opponentScore}
      pendingGarbage={pendingGarbage}
      actionText={actionText}
      countdown={countdown}
      finalTime={finalTime}
      elapsedTime={elapsedTime}
      socketRef={socketRef}
      setSocket={setSocket}
      setIsWaiting={setIsWaiting}
      setDropTime={setDropTime}
      setAppState={setAppState}
      joinOnline={joinOnline}
      formatTime={formatTime}
      records={records}
      createStage={createStage}
    />
  );
};

export default App;
