import { useState, useEffect, useCallback, useRef } from 'react';
import { Stage } from '@pixi/react';
import GameBoard from './components/GameBoard';
import { usePlayer } from './hooks/usePlayer';
import { useStage } from './hooks/useStage';
import { useInterval } from './hooks/useInterval';
import { createStage, checkCollision, calculateGhostY, STAGE_WIDTH, type Cell } from './utils/gameHelpers';
import { resetTetrominoBag, TETROMINOS } from './utils/tetrominos';

/** Standard Tetris line-clear points (×level) */
const LINE_POINTS = [0, 100, 300, 500, 800];

/** Drop interval for a given level (min 80 ms) */
const levelDropTime = (level: number) => Math.max(80, 1000 - (level - 1) * 90);

const App = () => {
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);

  const [player, updatePlayerPos, resetPlayer, playerRotate, playerHold, holdInfo, resetHold, nextPieceKeys] = usePlayer();

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

  const [stage, setStage, rowsCleared] = useStage(player, resetPlayer, checkGameOver);

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
  useEffect(() => {
    if (rowsCleared <= 0) return;
    setLines(prevLines => {
      const currentLevel = Math.floor(prevLines / 10) + 1;
      const pts = (LINE_POINTS[rowsCleared] ?? 800) * currentLevel;
      const newLines = prevLines + rowsCleared;
      const newLevel = Math.floor(newLines / 10) + 1;
      setScore(prev => prev + pts);
      setLevel(newLevel);
      setDropTime(levelDropTime(newLevel));
      return newLines;
    });
  }, [rowsCleared]);

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
  const movePlayer = useCallback((dir: number) => {
    if (!checkCollision(player, stage, { x: dir, y: 0 })) {
      updatePlayerPos({ x: dir, y: 0, collided: false });
    }
  }, [player, stage, updatePlayerPos]);

  const drop = useCallback(() => {
    if (!checkCollision(player, stage, { x: 0, y: 1 })) {
      updatePlayerPos({ x: 0, y: 1, collided: false });
    }
    // Lock delay is handled by the useEffect watching player position.
  }, [player, stage, updatePlayerPos]);

  const softDrop = useCallback(() => {
    const sdf = tuningRef.current.sdf;
    const currentPlayer = playerRef.current;
    
    if (sdf === 0) {
      const ghostY = calculateGhostY(currentPlayer, stage);
      const dist = ghostY - currentPlayer.pos.y;
      if (dist > 0) {
        updatePlayerPos({ x: 0, y: dist, collided: false });
        setScore(prev => prev + dist);
      }
    } else {
      let dropped = 0;
      for (let i = 0; i < sdf; i++) {
        if (!checkCollision(currentPlayer, stage, { x: 0, y: dropped + 1 })) {
          dropped++;
        } else {
          break;
        }
      }
      if (dropped > 0) {
        updatePlayerPos({ x: 0, y: dropped, collided: false });
        setScore(prev => prev + dropped);
      }
    }
  }, [stage, updatePlayerPos]);

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
    const ghostY = calculateGhostY(player, stage);
    const dist = ghostY - player.pos.y;

    updatePlayerPos({ x: 0, y: dist > 0 ? dist : 0, collided: true });
    if (dist > 0) setScore(prev => prev + dist * 2);
  }, [player, stage, updatePlayerPos, clearLockTimer]);

  // ── Game control ────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    setStage(createStage());
    setDropTime(levelDropTime(1));
    resetTetrominoBag();
    resetPlayer();
    resetHold();
    setGameOver(false);
    setScore(0);
    setLevel(1);
    setLines(0);
  }, [setStage, resetPlayer, resetHold]);

  // ── DAS / ARR keyboard handling ─────────────────────────────────────────────────────
  // Ref-proxy so DAS/ARR timer callbacks always call the latest movePlayer
  // (movePlayer changes every render because it captures player/stage state)
  const movePlayerRef = useRef<(dir: number) => void>(() => {});
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
    // 0 ARR -> interval of 1ms as fallback to instant
    const interval = tuningRef.current.arr <= 0 ? 1 : tuningRef.current.arr;
    arrTimerRef.current = setInterval(() => {
      const dir = getActiveDir();
      if (dir !== null) movePlayerRef.current(dir);
    }, interval);
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
            movePlayerRef.current(currentDir);
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
            movePlayer(dir);   // immediate single move
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
          if (!e.repeat) playerRotate(stage, 1);
          break;
        case conf.rotateCCW:
          if (!e.repeat) playerRotate(stage, -1);
          break;
        case conf.rotate180:
          if (!e.repeat) playerRotate(stage, 2);
          break;
        case conf.hold:
          if (!e.repeat) playerHold();
          break;
      }
    },
    [gameOver, dropTime, movePlayer, softDrop, hardDrop, playerRotate, stage, playerHold, startDASARR, startGame]
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
            movePlayerRef.current(dir); // immediate move in remaining direction
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
