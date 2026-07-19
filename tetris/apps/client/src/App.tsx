import { useState, useEffect, useCallback, useRef } from 'react';
import { Stage } from '@pixi/react';
import GameBoard from './components/GameBoard';
import { usePlayer } from './hooks/usePlayer';
import { useStage } from './hooks/useStage';
import { useInterval } from './hooks/useInterval';
import { createStage, checkCollision, calculateGhostY } from './utils/gameHelpers';
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
  const [stage, setStage, rowsCleared] = useStage(player, resetPlayer);

  // ── Tuning (ARR, DAS, DCD, SDF) ─────────────────────────────────────────
  const [tuning, setTuning] = useState({
    das: 133,
    arr: 50,
    dcd: 0,
    sdf: 0 // 0 means infinity (instant soft drop)
  });
  const tuningRef = useRef(tuning);
  useEffect(() => { tuningRef.current = tuning; }, [tuning]);

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

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
  }, []);

  const lockPiece = useCallback(() => {
    const currentPlayer = playerRef.current;
    const isTopOut = currentPlayer.tetromino.some((row, y) =>
      row.some(cell => cell !== 0 && currentPlayer.pos.y + y <= 0)
    );
    if (isTopOut) {
      setGameOver(true);
      setDropTime(null);
      return;
    }
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

    if (checkCollision(player, stage, { x: 0, y: 1 })) {
      startLockTimer();
    } else {
      clearLockTimer();
    }
  }, [player, stage, gameOver, dropTime, startLockTimer, clearLockTimer]);

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

  // Automatically apply soft drop if 's' is held and the piece moves/rotates/spawns
  useEffect(() => {
    if (gameOver || !dropTime) return;
    if (heldKeys.current.has('s')) {
      softDrop();
    }
  }, [player.pos.x, player.rotationIndex, player.tetromino, gameOver, dropTime, softDrop]);

  /** Hard drop: instantly land the piece at ghost position (+2 pts/row) */
  const hardDrop = useCallback(() => {
    clearLockTimer();
    const ghostY = calculateGhostY(player, stage);
    const dist = ghostY - player.pos.y;
    
    // Check top out before locking
    const isTopOut = player.tetromino.some((row, y) =>
      row.some(cell => cell !== 0 && ghostY + y <= 0)
    );
    if (isTopOut) {
      setGameOver(true);
      setDropTime(null);
      return;
    }

    updatePlayerPos({ x: 0, y: dist > 0 ? dist : 0, collided: true });
    if (dist > 0) setScore(prev => prev + dist * 2);
  }, [player, stage, updatePlayerPos, clearLockTimer]);

  // ── Game control ────────────────────────────────────────────────────────
  const startGame = () => {
    setStage(createStage());
    setDropTime(levelDropTime(1));
    resetTetrominoBag();
    resetPlayer();
    resetHold();
    setGameOver(false);
    setScore(0);
    setLevel(1);
    setLines(0);
  };

  // ── DAS / ARR keyboard handling ─────────────────────────────────────────────────────
  // Ref-proxy so DAS/ARR timer callbacks always call the latest movePlayer
  // (movePlayer changes every render because it captures player/stage state)
  const movePlayerRef = useRef<(dir: number) => void>(() => {});
  useEffect(() => { movePlayerRef.current = movePlayer; }, [movePlayer]);

  const heldKeys = useRef<Set<string>>(new Set());
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
    const a = heldKeys.current.has('a');
    const d = heldKeys.current.has('d');
    if (a && !d) return -1;
    if (d && !a) return 1;
    return null;
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
    }
  }, [gameOver, dropTime, clearDASARR]);

  // Clean up timers on unmount
  useEffect(() => () => clearDASARR(), [clearDASARR]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (gameOver || !dropTime) return;

      const key = e.key.toLowerCase();

      if (['shift', ',', '.', '/', 's', 'a', 'd', 'w'].includes(key)) {
        e.preventDefault();
      }

      switch (key) {
        case 'a':
        case 'd': {
          const dir = key === 'a' ? -1 : 1;
          // Only react to the first physical press; ignore browser key-repeat.
          // ARR interval handles subsequent repeats after DAS.
          if (!heldKeys.current.has(key)) {
            heldKeys.current.add(key);
            movePlayer(dir);   // immediate single move
            startDASARR();     // start DAS → ARR chain
          }
          break;
        }
        case 's':
          // Soft drop
          softDrop();
          break;
        case 'w':
          if (!e.repeat) hardDrop();
          break;
        case '/':
          if (!e.repeat) playerRotate(stage, 1);
          break;
        case ',':
          if (!e.repeat) playerRotate(stage, -1);
          break;
        case '.':
          if (!e.repeat) playerRotate(stage, 2);
          break;
        case 'shift':
          if (!e.repeat) playerHold();
          break;
      }
    },
    [gameOver, dropTime, movePlayer, softDrop, hardDrop, playerRotate, stage, playerHold, startDASARR]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'a' || key === 'd') {
        heldKeys.current.delete(key);
        clearDASARR();
        // If the opposite direction is still held, restart DAS for it
        const dir = getActiveDir();
        if (dir !== null) {
          movePlayerRef.current(dir); // immediate move in remaining direction
          startDASARR();
        }
      } else {
        heldKeys.current.delete(key);
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

        <Stage width={300} height={600} options={{ backgroundColor: 0x222222 }}>
          <GameBoard stage={stage} />
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
    </div>
  );
};

export default App;
