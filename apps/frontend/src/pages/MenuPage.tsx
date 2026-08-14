import { useEffect, useCallback, useRef, useState } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import { useStage } from '../hooks/useStage';
import { useInterval } from '../hooks/useInterval';
import { checkCollision, calculateGhostY, type Cell } from '../utils/gameHelpers';
import { useConfig } from '../hooks/useConfig';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { useGameState } from '../hooks/useGameState';
import { useNavigate } from 'react-router-dom';
import { Stage } from '@pixi/react';
import GameBoard from '../components/GameBoard';
import { useAuth } from '../hooks/useAuth';

const createMenuStage = (): Cell[][] => {
  const width = 41;
  const height = 40;
  const stage = Array.from(Array(height), () =>
    new Array(width).fill([0, 'clear']) as Cell[]
  );

  for (let y = height - 5; y < height; y++) {
    stage[y][0] = ['B', 'merged'];
    stage[y][8] = ['B', 'merged'];
    stage[y][16] = ['B', 'merged'];
    stage[y][24] = ['B', 'merged'];
    stage[y][32] = ['B', 'merged'];
    stage[y][40] = ['B', 'merged'];
  }
  for (let x = 0; x < width; x++) {
    stage[height - 1][x] = ['B', 'merged'];
  }
  return stage;
};

const MenuPage = () => {
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();
  const {
    appStateRef,
    dropTime, setDropTime,
    gameOver,
    countdownRef,
  } = useGameState();

  const [player, updatePlayerPos, resetPlayer, playerRotate, playerHold, , , , movePlayerHorizontal, setPlayer] = usePlayer();

  const checkGameOver = useCallback(() => false, []);

  const [stage, setStage, lockEvent, stageRef] = useStage(player, resetPlayer, checkGameOver, true);

  const { keyConfig, keyConfigRef, tuningRef } = useConfig();

  const lastProcessedEventIdRef = useRef(-1);

  useEffect(() => {
    const menuStage = createMenuStage();
    setStage(menuStage);
    stageRef.current = menuStage;
    resetPlayer(41, menuStage);
    setDropTime(1000);
  }, [setStage, resetPlayer, setDropTime, stageRef]);

  const [transitionMode, setTransitionMode] = useState<string | null>(null);

  useEffect(() => {
    if (!lockEvent || lockEvent.id === lastProcessedEventIdRef.current || transitionMode) return;
    lastProcessedEventIdRef.current = lockEvent.id;

    const p = playerRef.current;
    let landedOnBar = false;
    p.tetromino.forEach((row) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const pX = x + p.pos.x;
          if (pX % 8 === 0) landedOnBar = true;
        }
      });
    });

    if (landedOnBar) {
      setTransitionMode('RETRY');
      setDropTime(null);
      setTimeout(() => {
        const menuStage = createMenuStage();
        setStage(menuStage);
        stageRef.current = menuStage;
        resetPlayer(41, menuStage);
        setTransitionMode(null);
        setDropTime(1000);
      }, 1500);
      return;
    }

    const { lockedX } = lockEvent;
    let mode = 'MARATHON';
    if (lockedX < 8) mode = '4_WIDE';
    else if (lockedX >= 8 && lockedX < 16) mode = '40_LINES';
    else if (lockedX >= 16 && lockedX < 24) mode = 'MARATHON';
    else if (lockedX >= 24 && lockedX < 32) mode = 'ONLINE_1V1';
    else if (lockedX >= 32) mode = 'CONFIG';
    
    setTransitionMode(mode);
    setDropTime(null);
    
    setTimeout(() => {
      navigate(`/lobby/${mode}`);
    }, 1500);
  }, [lockEvent, navigate, transitionMode, setDropTime, setStage, stageRef, resetPlayer]);

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
    lockTimerRef.current = setTimeout(() => lockPiece(), 500);
  }, [clearLockTimer, lockPiece]);

  useEffect(() => {
    if (gameOver || player.collided || !dropTime) {
      clearLockTimer();
      return;
    }
    if (player.spawnCount !== currentSpawnCountRef.current) {
      currentSpawnCountRef.current = player.spawnCount;
      lowestYRef.current = player.pos.y;
      lockResetCountRef.current = 0;
    } else if (player.pos.y > lowestYRef.current) {
      lowestYRef.current = player.pos.y;
      lockResetCountRef.current = 0;
    }

    const isTouchingFloor = checkCollision(player, stage, { x: 0, y: 1 });
    if (isTouchingFloor) {
      if (!lockTimerRef.current) {
        if (lockResetCountRef.current >= 15) lockPiece();
        else startLockTimer();
      } else {
        if (lastIncrementedPlayerRef.current !== player) {
          lastIncrementedPlayerRef.current = player;
          if (lockResetCountRef.current < 15) {
            lockResetCountRef.current++;
            startLockTimer();
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
        return { ...prev, pos: { x: prev.pos.x, y: prev.pos.y + 1 }, collided: false, lastAction: 'drop' };
      }
      return prev;
    });
  }, [stageRef, setPlayer]);

  const softDrop = useCallback(() => {
    const sdf = tuningRef.current.sdf;
    setPlayer(prev => {
      if (sdf === 0) {
        const ghostY = calculateGhostY(prev, stageRef.current);
        const dist = ghostY - prev.pos.y;
        if (dist > 0) return { ...prev, pos: { x: prev.pos.x, y: ghostY }, collided: false, lastAction: 'drop' };
      } else {
        let dropped = 0;
        for (let i = 0; i < sdf; i++) {
          if (!checkCollision(prev, stageRef.current, { x: 0, y: dropped + 1 })) dropped++;
          else break;
        }
        if (dropped > 0) return { ...prev, pos: { x: prev.pos.x, y: prev.pos.y + dropped }, collided: false, lastAction: 'drop' };
      }
      return prev;
    });
  }, [stageRef, setPlayer]);

  const hardDrop = useCallback(() => {
    clearLockTimer();
    setPlayer(prev => {
      const ghostY = calculateGhostY(prev, stageRef.current);
      const dist = ghostY - prev.pos.y;
      return { ...prev, pos: { x: prev.pos.x, y: ghostY }, collided: true, lastAction: dist > 0 ? 'drop' : prev.lastAction };
    });
  }, [stageRef, setPlayer, clearLockTimer]);

  const { heldKeys } = useKeyboardControls({
    player, stageRef, tuningRef, keyConfigRef, gameOver, dropTime, appStateRef,
    countdownRef, listeningActionRef: useRef(null), setKeyConfig: () => {}, setListeningAction: () => {},
    movePlayerHorizontal, softDrop, hardDrop, playerRotate, playerHold, startGame: () => {},
    socketRef: useRef(null), setSocket: () => {}, setIsWaiting: () => {}, setDropTime, quitGame: () => navigate('/')
  });

  useEffect(() => {
    if (gameOver || !dropTime) return;
    if (heldKeys.current?.has(keyConfig.softDrop)) softDrop();
  }, [player.pos.x, player.rotationIndex, player.tetromino, gameOver, dropTime, softDrop, keyConfig.softDrop, heldKeys]);



  useInterval(drop, dropTime);

  const handleMouseSelect = (colIndex: number) => {
    if (transitionMode) return;
    const modes = ['4_WIDE', '40_LINES', 'MARATHON', 'ONLINE_1V1', 'CONFIG'];
    const selectedMode = modes[colIndex];
    setTransitionMode(selectedMode);
    setTimeout(() => {
      navigate(selectedMode === 'CONFIG' ? '/lobby/CONFIG' : `/lobby/${selectedMode}`);
    }, 500);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px', backgroundColor: '#111', color: 'white',
      fontFamily: "'Press Start 2P', monospace", height: '100vh', width: '100vw', boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '1230px', marginBottom: '20px' }}>
        <button 
          onClick={() => navigate('/')}
          style={{
            width: '150px',
            padding: '12px 0',
            fontSize: '14px',
            fontFamily: "'Press Start 2P', monospace",
            backgroundColor: '#333',
            color: 'white',
            border: '4px solid white',
            cursor: 'pointer',
            boxShadow: '4px 4px 0px #000'
          }}
        >
          ◀ TOP
        </button>
        <h1 style={{ fontSize: '48px', margin: 0, textShadow: '4px 4px 0px #555', letterSpacing: '2px', color: '#fff' }}>TETRIS</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setDropTime(dropTime ? null : 1000)}
            style={{
              width: '150px',
              padding: '12px 0',
              fontSize: '14px',
              fontFamily: "'Press Start 2P', monospace",
              backgroundColor: dropTime ? '#e74c3c' : '#4caf50',
              color: 'white',
              border: '4px solid white',
              cursor: 'pointer',
              boxShadow: '4px 4px 0px #333'
            }}
          >
            {dropTime ? 'STOP' : 'RESUME'}
          </button>
          
          {token && user ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => navigate('/dashboard')}
                style={{
                  padding: '12px 20px',
                  fontSize: '14px',
                  fontFamily: "'Press Start 2P', monospace",
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: '4px solid white',
                  cursor: 'pointer',
                  boxShadow: '4px 4px 0px #333'
                }}
              >
                DASHBOARD
              </button>
              <button 
                onClick={() => { logout(); navigate('/'); }}
                style={{
                  padding: '12px 20px',
                  fontSize: '14px',
                  fontFamily: "'Press Start 2P', monospace",
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: '4px solid white',
                  cursor: 'pointer',
                  boxShadow: '4px 4px 0px #333'
                }}
              >
                LOGOUT
              </button>
            </div>
          ) : (
            <button 
              onClick={() => navigate('/login?redirectTo=/menu&cancelTo=/menu')}
              style={{
                padding: '12px 20px',
                fontSize: '14px',
                fontFamily: "'Press Start 2P', monospace",
                backgroundColor: '#9b59b6',
                color: 'white',
                border: '4px solid white',
                cursor: 'pointer',
                boxShadow: '4px 4px 0px #333'
              }}
            >
              LOGIN / REGISTER
            </button>
          )}
        </div>
      </div>
      
      <div style={{ position: 'relative', width: 1230, height: 660 }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0 }}>
          <Stage width={1230} height={1200} options={{ backgroundAlpha: 0 }}>
            <GameBoard 
              stage={stage} 
              player={transitionMode ? { ...player, tetromino: [] } : player} 
              ghostY={calculateGhostY(player, stage)} 
            />
          </Stage>
        </div>

        <div style={{ position: 'absolute', top: 0, left: 0, width: '1230px', height: '660px', display: 'flex', pointerEvents: 'none', zIndex: 15 }}>
          {['4_WIDE', '40_LINES', 'MARATHON', 'ONLINE_1V1', 'CONFIG'].map((mode, index) => (
            <div 
              key={mode}
              onClick={() => handleMouseSelect(index)}
              style={{ width: '246px', height: '100%', cursor: 'pointer', pointerEvents: 'auto' }}
              title={`Click to select ${mode}`}
            />
          ))}
        </div>

        <div style={{ position: 'absolute', top: '100px', left: 0, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none', zIndex: 20 }}>
           <h2 style={{ color: 'white', fontSize: '24px', letterSpacing: '2px', textShadow: '2px 2px 0px #333', backgroundColor: 'rgba(0,0,0,0.8)', padding: '15px 30px', border: '4px solid white', margin: 0 }}>DROP TO SELECT MODE</h2>
           
           <div style={{ position: 'absolute', top: 0, left: '50%', marginLeft: '320px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '10px 20px', border: '2px solid white', color: '#ccc', fontSize: '10px', textAlign: 'left', lineHeight: '1.6' }}>
             <div style={{ color: '#fff', marginBottom: '8px', fontSize: '12px', borderBottom: '1px solid #555', paddingBottom: '4px' }}>CONTROLS</div>
             <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px' }}>
               <div style={{color: '#4caf50'}}>LEFT:</div><div>{keyConfig.left?.replace('Arrow', '').replace('Key', '').toUpperCase() || ''}</div>
               <div style={{color: '#4caf50'}}>RIGHT:</div><div>{keyConfig.right?.replace('Arrow', '').replace('Key', '').toUpperCase() || ''}</div>
               <div style={{color: '#4caf50'}}>ROTATE:</div><div>{keyConfig.rotateCW?.replace('Arrow', '').replace('Key', '').toUpperCase() || ''}</div>
               <div style={{color: '#4caf50'}}>H-DROP:</div><div>{keyConfig.hardDrop?.replace('Arrow', '').replace('Key', '').toUpperCase() || ''}</div>
               <div style={{color: '#4caf50'}}>S-DROP:</div><div>{keyConfig.softDrop?.replace('Arrow', '').replace('Key', '').toUpperCase() || ''}</div>
             </div>
           </div>
        </div>
        <div style={{ position: 'absolute', bottom: '150px', left: '15px', width: '1230px', display: 'flex', pointerEvents: 'none', zIndex: 10 }}>
          <div style={{ width: '240px', textAlign: 'center', color: '#3498db', fontSize: '14px', textShadow: '2px 2px 0px #000' }}>4-WIDE</div>
          <div style={{ width: '240px', textAlign: 'center', color: '#ff9800', fontSize: '14px', textShadow: '2px 2px 0px #000' }}>40 LINES</div>
          <div style={{ width: '240px', textAlign: 'center', color: '#4caf50', fontSize: '14px', textShadow: '2px 2px 0px #000' }}>MARATHON</div>
          <div style={{ width: '240px', textAlign: 'center', color: '#e74c3c', fontSize: '14px', textShadow: '2px 2px 0px #000' }}>ONLINE 1v1</div>
          <div style={{ width: '240px', textAlign: 'center', color: '#9b59b6', fontSize: '14px', textShadow: '2px 2px 0px #000' }}>CONFIG</div>
        </div>

        {transitionMode && (
          <div style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            left: 0,
            width: '100%',
            height: '150px',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            borderTop: '4px solid white',
            borderBottom: '4px solid white',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 20
          }}>
            <h1 style={{
              fontSize: '64px',
              color: 'white',
              textShadow: '6px 6px 0px #333, 0 0 20px #fff',
              letterSpacing: '4px',
              animation: 'blink 0.5s infinite alternate'
            }}>
              {transitionMode.replace('_', ' ')}
            </h1>
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuPage;
