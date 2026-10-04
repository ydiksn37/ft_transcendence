import React, { useEffect, useState, useRef } from 'react';
import GameBoard from './GameBoard';
import { ManagedPixiStage } from './ManagedPixiStage';
import { createStage, checkCollision, calculateGhostY, type Cell } from '../utils/gameHelpers';
import { randomTetromino } from '../utils/tetrominos';

const BACKGROUND_STAGE_OPTIONS = { backgroundAlpha: 0, resolution: 1 } as const;

export const BackgroundTetris: React.FC<{ reversed?: boolean }> = ({ reversed }) => {
  const [stage, setStage] = useState(createStage(10));
  const [player, setPlayer] = useState({
    pos: { x: 3, y: 0 },
    tetromino: randomTetromino().shape,
    collided: false,
    rotationIndex: 0,
    spawnCount: 0
  });

  const [ fitScale, setFitScale ] = useState(0.8);
  useEffect(() => {
    const handleResize = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      
      // Base scale: try to fit the 660px board nicely in the vertical space
      let s = vh / 700;
      
      // On wide screens, scale up more so it doesn't look tiny
      if (vw > 1200) {
        s = Math.max(s, vw / 1600);
      }
      
      const isMobile = vw <= 768;
      
      // Max width calculation to prevent overflow or overlapping the center UI
      // On mobile: centered, can use 90% of screen.
      // On desktop: anchor is 260px from center. Distance to edge is (vw / 2) - 260.
      // Leave an extra 20px margin on the outer edge -> (vw / 2) - 280.
      const maxAvailableWidth = isMobile 
        ? vw * 0.9 
        : Math.max(100, (vw / 2) - 280);
        
      const maxScaleX = maxAvailableWidth / 300; 
      
      setFitScale(Math.min(s, maxScaleX));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const stageRef = useRef(stage);
  const playerRef = useRef(player);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentStage = stageRef.current;
      const currentPlayer = playerRef.current;
      
      let nextPlayer = { ...currentPlayer, pos: { ...currentPlayer.pos } };
      
      // AI Move
      if (Math.random() < 0.3) {
        const dir = (Math.random() < 0.5) ? 1 : -1;
        if (!checkCollision(nextPlayer, currentStage, { x: dir, y: 0 })) {
          nextPlayer.pos.x += dir;
        }
      }

      // AI Drop
      if (!checkCollision(nextPlayer, currentStage, { x: 0, y: 1 })) {
        nextPlayer.pos.y += 1;
        setPlayer(nextPlayer);
      } else {
        // Lock piece
        let newStage = currentStage.map(row => [...row]);
        nextPlayer.tetromino.forEach((row, y) => {
          row.forEach((value, x) => {
            if (value !== 0) {
              const ny = y + nextPlayer.pos.y;
              const nx = x + nextPlayer.pos.x;
              if (ny >= 0 && ny < newStage.length && nx >= 0 && nx < newStage[0].length) {
                newStage[ny][nx] = [value, 'merged'] as Cell;
              }
            }
          });
        });

        // Clear lines
        newStage = newStage.reduce((acc, row) => {
          if (row.findIndex(cell => cell[0] === 0) === -1) {
            acc.unshift(new Array(10).fill([0, 'clear']) as Cell[]);
            return acc;
          }
          acc.push(row);
          return acc;
        }, [] as Cell[][]);

        // Spawn new piece
        nextPlayer = {
          pos: { x: 3, y: 0 },
          tetromino: randomTetromino().shape,
          collided: false,
          rotationIndex: 0,
          spawnCount: nextPlayer.spawnCount + 1
        };

        // Check game over
        if (checkCollision(nextPlayer, newStage, { x: 0, y: 0 })) {
          newStage = createStage(10);
        }

        setStage(newStage);
        setPlayer(nextPlayer);
      }
    }, 120);

    return () => clearInterval(interval);
  }, []);

  const isMobile = window.innerWidth <= 768;
  const origin = isMobile ? 'center center' : (reversed ? 'right center' : 'left center');

  return (
    <div style={{ transform: `scale(${fitScale})`, transformOrigin: origin, pointerEvents: 'none' }}>
      <div style={{ opacity: 0.6, transform: reversed ? 'scaleX(-1)' : 'none', transformOrigin: 'center center' }}>
        <div style={{ position: 'relative', width: 300, height: 660 }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0 }}>
            <ManagedPixiStage width={300} height={1200} options={BACKGROUND_STAGE_OPTIONS}>
              <GameBoard stage={stage} player={player as any} ghostY={calculateGhostY(player as any, stage)} />
            </ManagedPixiStage>
          </div>
        </div>
      </div>
    </div>
  );
};
