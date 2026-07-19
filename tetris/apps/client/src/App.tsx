import React, { useState, useEffect, useCallback } from 'react';
import { Stage } from '@pixi/react';
import GameBoard from './components/GameBoard';
import { usePlayer } from './hooks/usePlayer';
import { useStage } from './hooks/useStage';
import { useInterval } from './hooks/useInterval';
import { createStage, checkCollision } from './utils/gameHelpers';
import { resetTetrominoBag,TETROMINOS } from './utils/tetrominos';

const App = () => {
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);

  const [player, updatePlayerPos, resetPlayer, playerRotate,playerHold,holdInfo,resetHold] = usePlayer();
  const [stage, setStage] = useStage(player, resetPlayer);

  const movePlayer = (dir: number) => {
    if (!gameOver) {
      if (!checkCollision(player, stage, { x: dir, y: 0 })) {
        updatePlayerPos({ x: dir, y: 0, collided: false });
      }
    }
  };

  const drop = () => {
    if (!gameOver) {
      if (!checkCollision(player, stage, { x: 0, y: 1 })) {
        updatePlayerPos({ x: 0, y: 1, collided: false });
      } else {
        if (player.pos.y < 1) {
          setGameOver(true);
          setDropTime(null);
          return;
        }
        updatePlayerPos({ x: 0, y: 0, collided: true });
      }
    }
  };

  const dropPlayer = () => {
    setDropTime(null);
    drop();
  };

  const startGame = () => {
    setStage(createStage());
    setDropTime(1000);
	resetTetrominoBag();
    resetPlayer();
	resetHold();
    setGameOver(false);
  };

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!gameOver) {
        if (e.key === 's') {
          setDropTime(1000);
        }
      }
    },
    [gameOver]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (gameOver) return;

      if (['Shift', ',', '/', 's', 'a', 'd'].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'a') {
        movePlayer(-1);
      } else if (e.key === 'd') {
        movePlayer(1);
      } else if (e.key === 's') {
        dropPlayer();
      } else if (e.key === '/') {
        playerRotate(stage, 1);
      } else if (e.key === ',') {
        playerRotate(stage, -1);
      } else if (e.key === 'Shift') {
		  playerHold();
	  }
    },
    [player, stage, gameOver, playerRotate, playerHold]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  useInterval(() => {
    drop();
  }, dropTime);

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

        <div style={{ width: '80px' }}></div>

      </div>
    </div>
  );
};

export default App;
