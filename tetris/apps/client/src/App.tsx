import { useState, useEffect, useCallback, useRef } from 'react';
import { Stage } from '@pixi/react';
import GameBoard from './components/GameBoard';
import { usePlayer } from './hooks/usePlayer';
import { useStage } from './hooks/useStage';
import { useInterval } from './hooks/useInterval';
import { createStage, checkCollision, calculateGhostY, STAGE_WIDTH, type Cell } from './utils/gameHelpers';
import { resetTetrominoBag, TETROMINOS } from './utils/tetrominos';

/** Drop interval for a given level (min 80 ms) */
const levelDropTime = (level: number) => Math.max(80, 1000 - (level - 1) * 90);

const App = () => {
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);

  const [player, updatePlayerPos, resetPlayer, playerRotate, playerHold, holdInfo, resetHold, nextPieceKeys, movePlayerHorizontal, setPlayer] = usePlayer();

  const checkGameOver = useCallback((newStage: Cell[][]) => {
     if (!nextPieceKeys || nextPieceKeys.length === 0) return false;
     const nextPiece = TETROMINOS[nextPieceKeys[0] as keyof typeof TETROMINOS].shape;
     const dummyPlayer = {
       pos: { x: STAGE_WIDTH / 2 - 2, y: 0 },
       tetromino: nextPiece,
       collided: false,
       rotationIndex: 0,
       spawnCount: 0
     };
     if (checkCollision(dummyPlayer, newStage, { x: 0, y: 0 })) {
       setGameOver(true);
       setDropTime(null);
       return true;
     }
     return false;
  }, [nextPieceKeys]);

  const [stage, setStage, lockEvent, stageRef] = useStage(player, resetPlayer, checkGameOver);

  // ── Tuning (ARR, DAS, DCD, SDF) ─────────────────────────────────────────
  const [tuning, setTuning] = useState({
    das: 133,
    arr: 50,
    dcd: 0,
    sdf: 0 // 0 means infinity (instant soft drop)
  });
  const tuningRef = useRef(tuning);
  useEffect(() => { tuningRef.current = tuning; }, [tuning]);

  // ── Key Config ──────────────────────────────────────────────────────────
  const [keyConfig, setKeyConfig] = useState({
    left: 'KeyA',
    right: 'KeyD',
    softDrop: 'KeyS',
    hardDrop: 'KeyW',
    rotateCW: 'Slash',
    rotateCCW: 'Comma',
    rotate180: 'Period',
    hold: 'ShiftLeft',
    restart: 'KeyQ'
  });
  const keyConfigRef = useRef(keyConfig);
  useEffect(() => { keyConfigRef.current = keyConfig; }, [keyConfig]);

  const [listeningAction, setListeningAction] = useState<keyof typeof keyConfig | null>(null);
  const listeningActionRef = useRef(listeningAction);
  useEffect(() => { listeningActionRef.current = listeningAction; }, [listeningAction]);

  // ── Score / Level / Speed ───────────────────────────────────────────────
  const b2bRef = useRef(false);
  const comboRef = useRef(-1);
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionText, setActionText] = useState<string | null>(null);

  useEffect(() => {
    if (!lockEvent) return;
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
          const newLevel = Math.floor(newLines / 10) + 1;
          setLevel(newLevel);
          setDropTime(levelDropTime(newLevel));
          return newLines;
       });
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

  // ── Movement ────────────────────────────────────────────────────────────
  const movePlayer = useCallback((dir: number, forceSnap: boolean = false) => {
    movePlayerHorizontal(dir, stageRef.current, forceSnap);
  }, [stageRef, movePlayerHorizontal]);

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
  const startGame = useCallback(() => {
    const newStage = createStage();
    setStage(newStage);
    stageRef.current = newStage;
    setDropTime(levelDropTime(1));
    resetTetrominoBag();
    resetPlayer();
    resetHold();
    setGameOver(false);
    setScore(0);
    setLevel(1);
    setLines(0);
    comboRef.current = -1;
    b2bRef.current = false;
    setActionText(null);
  }, [setStage, resetPlayer, resetHold, stageRef]);

  // ── DAS / ARR keyboard handling ─────────────────────────────────────────────────────
  // Ref-proxy so DAS/ARR timer callbacks always call the latest movePlayer
  // (movePlayer changes every render because it captures player/stage state)
  const movePlayerRef = useRef<(dir: number, forceSnap?: boolean) => void>(() => {});
  useEffect(() => { movePlayerRef.current = movePlayer; }, [movePlayer]);

  const heldKeys = useRef<Set<string>>(new Set());
  const horizKeys = useRef<string[]>([]);
  const dasTimerRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const arrTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Cancel both the DAS timer and the ARR interval. */
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

  /** Return the active horizontal direction (-1 / 1) or null if both/neither held. */
  const getActiveDir = useCallback((): number | null => {
    if (horizKeys.current.length === 0) return null;
    const key = horizKeys.current[horizKeys.current.length - 1];
    return key === 'KeyA' ? -1 : 1;
  }, []);

  const startARR = useCallback(() => {
    if (arrTimerRef.current !== null) clearInterval(arrTimerRef.current);
    
    if (tuningRef.current.arr <= 0) {
      const dir = getActiveDir();
      if (dir !== null) movePlayerRef.current(dir, true);
      
      arrTimerRef.current = setInterval(() => {
        const currentDir = getActiveDir();
        if (currentDir !== null) movePlayerRef.current(currentDir, true);
      }, 10);
    } else {
      arrTimerRef.current = setInterval(() => {
        const dir = getActiveDir();
        if (dir !== null) movePlayerRef.current(dir, false);
      }, tuningRef.current.arr);
    }
  }, [getActiveDir]);

  /** Start DAS timer; after it fires, start ARR interval. */
  const startDASARR = useCallback(() => {
    clearDASARR();
    dasTimerRef.current = setTimeout(() => {
      dasTimerRef.current = null;
      startARR();
    }, tuningRef.current.das);
  }, [clearDASARR, startARR]);

  // Apply DCD (DAS Cut Delay) when a new piece spawns (tetromino changes)
  useEffect(() => {
    if (gameOver || !dropTime) return;

    if (tuningRef.current.dcd > 0) {
      const dir = getActiveDir();
      if (dir !== null) {
        clearDASARR();
        setTimeout(() => {
          const currentDir = getActiveDir();
          if (currentDir !== null) {
            movePlayerRef.current(currentDir, false);
            startARR();
          }
        }, tuningRef.current.dcd);
      }
    }
  }, [player.tetromino, gameOver, dropTime, clearDASARR, getActiveDir, startARR]);

  // Stop DAS/ARR whenever the game pauses or ends
  useEffect(() => {
    if (gameOver || !dropTime) {
      clearDASARR();
      heldKeys.current.clear();
      horizKeys.current = [];
    }
  }, [gameOver, dropTime, clearDASARR]);

  // Clean up timers on unmount
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

      if (Object.values(conf).includes(code)) {
        e.preventDefault();
      }

      if (code === conf.restart) {
        if (!e.repeat) startGame();
        return;
      }

      if (gameOver || !dropTime) return;

      switch (code) {
        case conf.left:
        case conf.right: {
          const dir = code === conf.left ? -1 : 1;
          // Only react to the first physical press; ignore browser key-repeat.
          // ARR interval handles subsequent repeats after DAS.
          if (!heldKeys.current.has(code)) {
            heldKeys.current.add(code);
            horizKeys.current.push(code);
            movePlayer(dir, false);   // immediate single move
            startDASARR();     // start DAS → ARR chain
          }
          break;
        }
        case conf.softDrop:
          if (!heldKeys.current.has(conf.softDrop)) {
            heldKeys.current.add(conf.softDrop);
          }
          // Soft drop
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
          if (!e.repeat) playerHold();
          break;
      }
    },
    [gameOver, dropTime, movePlayer, softDrop, hardDrop, playerRotate, stageRef, playerHold, startDASARR, startGame]
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
            movePlayerRef.current(dir, false); // immediate move in remaining direction
            startDASARR();
          }
        }
      } else {
        heldKeys.current.delete(code);
      }
    },
    [clearDASARR, getActiveDir, startDASARR]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Auto-drop (gravity)
  useInterval(drop, dropTime);

  // ── Hold box render (original UI) ───────────────────────────────────────
  const renderHoldBox = () => {
	  const boxStyle = {
		  width: '80px', height: '80px', backgroundColor: '#333',
		  display: 'flex', alignItems: 'center', justifyContent: 'center',
		  borderRadius: '8px', border: '2px solid #555'
	  };

	  if (!holdInfo.tetromino) {
		  return <div style={boxStyle}></div>;
	  }

	  const shape = TETROMINOS[holdInfo.tetromino as keyof typeof TETROMINOS].shape;
	  const color = TETROMINOS[holdInfo.tetromino as keyof typeof TETROMINOS].color;

	  return (
		  <div style={boxStyle}>
		  <div style={{
			  display: 'grid',
			  gridTemplateColumns: `repeat(${shape[0].length}, 15px)`,
			  gap: '1px'
		  }}>
		  {shape.map((row, y) => row.map((cell, x) => (
			  <div key={`${y}-${x}`} style={{
				  width: 15, height: 15,
				  backgroundColor: cell === 0 ? 'transparent' : `${color}`,
				  borderRadius: '2px'
			  }} />
		  )))}
		  </div>
		  </div>
	  );
  };

  // ── Render (original UI + score/level/lines added) ──────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
      <style>{`
        @keyframes pop {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          70% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
      <h1>PixiJS Tetris</h1>
      <button
        onClick={startGame}
        style={{ marginBottom: '20px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
      >
        Start Game
      </button>

      {gameOver && <h2 style={{ color: 'red', margin: '0 0 10px 0' }}>GAME OVER</h2>}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>HOLD</h3>
          {renderHoldBox()}
          {holdInfo.hasHeld && <span style={{ color: 'gray', fontSize: '12px', marginTop: '5px' }}>Locked</span>}
        </div>

        <Stage width={300} height={660} options={{ backgroundAlpha: 0 }}>
          <GameBoard stage={stage} player={player} ghostY={calculateGhostY(player, stage)} />
        </Stage>

        {/* Action Text Overlay (e.g. T-Spin, Tetris) */}
        {actionText && (
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '30%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            color: '#fff',
            textShadow: '2px 2px 4px #000, 0 0 10px #ff00ff',
            fontSize: '24px',
            fontWeight: 'bold',
            textAlign: 'center',
            whiteSpace: 'pre-line',
            animation: 'pop 0.3s ease-out',
            zIndex: 10
          }}>
            {actionText}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '80px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>NEXT</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {nextPieceKeys?.map((key, idx) => {
                const shape = TETROMINOS[key as keyof typeof TETROMINOS].shape;
                const color = TETROMINOS[key as keyof typeof TETROMINOS].color;
                const boxStyle = {
                  width: '80px', height: '80px', backgroundColor: '#333',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '8px', border: '2px solid #555'
                };
                return (
                  <div key={idx} style={boxStyle}>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: `repeat(${shape[0].length}, 15px)`, 
                      gap: '1px' 
                    }}>
                      {shape.map((row, y) => row.map((cell, x) => (
                        <div key={`${y}-${x}`} style={{
                          width: 15, height: 15, 
                          backgroundColor: cell === 0 ? 'transparent' : `${color}`,
                          borderRadius: '2px'
                        }} />
                      )))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div><strong>SCORE</strong><br />{score}</div>
          <div><strong>LEVEL</strong><br />{level}</div>
          <div><strong>LINES</strong><br />{lines}</div>
        </div>

      </div>

      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#333', borderRadius: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'gray' }}>ARR (ms)</label>
          <input type="number" min="0" value={tuning.arr} onChange={e => setTuning(p => ({...p, arr: Number(e.target.value)}))} style={{ width: '60px', padding: '4px', textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'gray' }}>DAS (ms)</label>
          <input type="number" min="0" value={tuning.das} onChange={e => setTuning(p => ({...p, das: Number(e.target.value)}))} style={{ width: '60px', padding: '4px', textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'gray' }}>DCD (ms)</label>
          <input type="number" min="0" value={tuning.dcd} onChange={e => setTuning(p => ({...p, dcd: Number(e.target.value)}))} style={{ width: '60px', padding: '4px', textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'gray' }}>SDF (0=Inf)</label>
          <input type="number" min="0" value={tuning.sdf} onChange={e => setTuning(p => ({...p, sdf: Number(e.target.value)}))} style={{ width: '60px', padding: '4px', textAlign: 'center' }} />
        </div>
      </div>

      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#333', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: '#ccc' }}>Key Configuration</h4>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {Object.entries(keyConfig).map(([action, code]) => (
            <div key={action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', color: 'gray', textTransform: 'capitalize' }}>{action.replace(/([A-Z])/g, ' $1').trim()}</label>
              <button
                onClick={() => {
                  setListeningAction(action as keyof typeof keyConfig);
                  // Focus the window to ensure it receives key events
                  window.focus();
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: listeningAction === action ? '#ff4444' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  minWidth: '60px'
                }}
              >
                {listeningAction === action ? 'Press key...' : code.replace(/^Key|Left|Right$/, '')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
