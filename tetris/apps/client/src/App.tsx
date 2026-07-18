import React, { useState, useEffect, useCallback } from 'react';
import { Stage } from '@pixi/react';
import GameBoard from './components/GameBoard';
import { usePlayer } from './hooks/usePlayer';
import { useStage } from './hooks/useStage';
import { createStage, checkCollision } from './utils/gameHelpers';

const App = () => {
  const [player, updatePlayerPos, resetPlayer, playerRotate] = usePlayer();
  const [stage, setStage] = useStage(player, resetPlayer);
  const [gameOver, setGameOver] = useState(false);

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
          return;
        }
        updatePlayerPos({ x: 0, y: 0, collided: true });
      }
    }
  };

  const startGame = () => {
    setStage(createStage());
    resetPlayer();
    setGameOver(false);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (gameOver) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'ArrowLeft') {
        movePlayer(-1);
      } else if (e.key === 'ArrowRight') {
        movePlayer(1);
      } else if (e.key === 'ArrowDown') {
        drop();
      } else if (e.key === 'ArrowUp') {
        playerRotate(stage, 1);
      }
    },
    [player, stage, gameOver,playerRotate]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
      
      <Stage width={300} height={600} options={{ backgroundColor: 0x222222 }}>
        <GameBoard stage={stage} />
      </Stage>
    </div>
  );
};

export default App;
