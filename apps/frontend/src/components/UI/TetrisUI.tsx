import React, { useState, useEffect } from 'react';
import { Stage } from '@pixi/react';
import GameBoard from '../GameBoard';
import { calculateGhostY, type Cell } from '../../utils/gameHelpers';
import { TETROMINOS } from '../../utils/tetrominos';
import type { Player } from '../../hooks/usePlayer';
import { Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

type TetrisUIProps = {
  stage: Cell[][];
  player: Player;
  gameOver: boolean;
  gameMode: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1';
  score: number;
  level: number;
  lines: number;
  nextPieceKeys: string[];
  holdInfo: { tetromino: string | null; hasHeld: boolean };
  isWaiting: boolean;
  matchResult: 'WIN' | 'LOSE' | null;
  opponentStage: Cell[][] | null;
  opponentScore: number;
  pendingGarbage: number[];
  actionText: string | null;
  countdown: string | null;
  finalTime: number | null;
  elapsedTime: number;
  piecesPlaced: number;
  attackLines: number;
  socketRef: React.MutableRefObject<Socket | null>;
  setSocket: (s: Socket | null) => void;
  setIsWaiting: (w: boolean) => void;
  setDropTime: React.Dispatch<React.SetStateAction<number | null>>;
  formatTime: (ms: number) => string;
  records: number[];
  createStage: (width?: number) => Cell[][];
  appState?: 'MENU' | 'PLAYING' | 'RECORDS' | 'CONFIG' | 'ONLINE_1V1';
};

export const TetrisUI: React.FC<TetrisUIProps> = ({
  stage, player, gameOver, gameMode, score, level, lines, nextPieceKeys, holdInfo,
  isWaiting, matchResult, opponentStage, opponentScore, pendingGarbage, actionText,
  countdown, finalTime, elapsedTime, piecesPlaced, attackLines, socketRef, setSocket, setIsWaiting, setDropTime,
  formatTime, records, createStage, appState
}) => {
  const [scale, setScale] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      // 850px is approximately the required vertical height.
      // 700px width for solo mode, 1200px width for 1v1 mode.
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const scaleY = vh / 850;
      const scaleX = vw / (appState === 'MENU' ? 1200 : (gameMode === 'ONLINE_1V1' ? 1200 : 700));
      setScale(Math.min(1, scaleY, scaleX));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [gameMode]);

  const neonSurface: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--color-neon-purple) 10%, #06000f)',
    border: '1px solid rgba(0,245,255,0.14)',
    borderRadius: '4px',
  }

  const boxStyle: React.CSSProperties = {
  ...neonSurface,
    width: '80px', height: '80px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'inset 0 0 12px rgba(0,0,0,0.6)',
  }

  const renderHoldBox = () => {
    if (!holdInfo.tetromino) {
      return <div style={boxStyle}></div>;
    }

    const shape = TETROMINOS[holdInfo.tetromino as keyof typeof TETROMINOS].shape;
    const color = TETROMINOS[holdInfo.tetromino as keyof typeof TETROMINOS].color;

    return (
      <div style={boxStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${shape[0].length}, 15px)`, gap: '1px' }}>
          {shape.map((row, y) => row.map((cell, x) => (
            <div key={`${y}-${x}`} style={{ width: 15, height: 15, backgroundColor: cell === 0 ? 'transparent' : `${color}`, borderRadius: '2px' }} />
          )))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', justifyContent: 'center', overflow: 'auto', padding: '20px 0' }}>
      <div style={{ 
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        transform: `scale(${scale})`, transformOrigin: 'top center'
      }}>
      <style>{`
        @keyframes pop {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          70% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
      


      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>HOLD</h3>
          {(gameMode === 'ONLINE_1V1' && isWaiting) ? <div style={boxStyle} /> : renderHoldBox()}
          {!(gameMode === 'ONLINE_1V1' && isWaiting) && holdInfo.hasHeld && <span style={{ color: 'gray', fontSize: '12px', marginTop: '5px' }}>Locked</span>}
          
          {(appState === 'PLAYING' || appState === 'ONLINE_1V1') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px', width: '100%' }}>
              <button
                onClick={() => {
                  if (socketRef.current) { socketRef.current.disconnect(); setSocket(null); }
                  setIsWaiting(false); setDropTime(null); 
                  navigate(`/lobby/${gameMode}`);
                }}
                style={{ padding: '12px 16px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#e53935', color: '#fff', border: '3px solid #8e0000', borderRadius: '0', width: '100%', fontFamily: 'inherit', textShadow: '2px 2px 0px #000' }}
              >
                QUIT
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 10px 0', visibility: 'hidden' }}>PLAYER</h3>
          <div style={{ position: 'relative' }}>
            <Stage width={stage.length > 0 ? stage[0].length * 30 : 300} height={660} options={{ backgroundAlpha: 0 }}>
            <GameBoard 
              stage={stage} 
              player={(gameMode === 'ONLINE_1V1' && isWaiting) || gameOver ? { pos: {x: 0, y:0}, tetromino: [[0]], collided: false, rotationIndex: 0, spawnCount: 0 } as any : player} 
              ghostY={(gameMode === 'ONLINE_1V1' && isWaiting) || gameOver ? 0 : calculateGhostY(player, stage)} 
              targetLine={
                gameMode === '40_LINES' && (40 - lines) <= 20 && (40 - lines) > 0 
                  ? 22 - (40 - lines) 
                  : undefined
              }
            />
          </Stage>


          {appState !== 'MENU' && gameMode === 'ONLINE_1V1' && pendingGarbage.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: '-20px',
              width: '10px',
              height: `${Math.min(100, (pendingGarbage.reduce((a,b)=>a+b,0) / 20) * 100)}%`,
              backgroundColor: 'red',
              borderRadius: '5px',
              transition: 'height 0.2s',
              boxShadow: '0 0 10px red'
            }}>
              <span style={{ position: 'absolute', top: '-25px', left: '-5px', color: 'red', fontWeight: 'bold' }}>
                {pendingGarbage.reduce((a,b)=>a+b,0)}
              </span>
            </div>
          )}

          {countdown && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'white',
              fontSize: '48px',
              fontWeight: 'bold',
              textShadow: '2px 2px 4px black',
              zIndex: 20,
              pointerEvents: 'none'
            }}>
              {countdown}
            </div>
          )}

          {gameOver && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              backgroundColor: 'rgba(34, 34, 34, 0.95)',
              padding: '25px',
              borderRadius: '8px',
              border: '2px solid red',
              zIndex: 50,
              minWidth: '250px',
              boxShadow: '0 0 20px rgba(255, 0, 0, 0.5)'
            }}>
              <h2 style={{ color: matchResult === 'WIN' ? 'gold' : 'red', margin: '0 0 15px 0', fontSize: '32px' }}>
                {gameMode === 'ONLINE_1V1' && matchResult
                  ? matchResult === 'WIN' ? 'YOU WIN!' : 'YOU LOSE'
                  : (lines >= 40 && gameMode === '40_LINES' ? 'FINISHED!' : 'GAME OVER')
                }
              </h2>
              {gameMode === '40_LINES' && finalTime && (
                <div style={{ marginBottom: '15px' }}>
                  <h3 style={{ margin: '5px 0' }}>Time: {formatTime(finalTime)}</h3>
                  {records.indexOf(finalTime) !== -1 && records.indexOf(finalTime) < 10 && (
                    <h3 style={{ color: 'gold', animation: 'pop 0.5s ease-out', margin: '5px 0' }}>
                      New Record! Rank: {records.indexOf(finalTime) + 1}
                    </h3>
                  )}
                </div>
              )}
              {gameMode === 'ONLINE_1V1' && matchResult && (
                <div style={{ color: 'white', fontSize: '18px', display: 'flex', justifyContent: 'center', gap: '30px', margin: '15px 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <strong style={{ color: '#aaa' }}>APM</strong><br/>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{elapsedTime > 0 ? (attackLines / (elapsedTime / 60000)).toFixed(1) : '0.0'}</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <strong style={{ color: '#aaa' }}>PPS</strong><br/>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{elapsedTime > 0 ? (piecesPlaced / (elapsedTime / 1000)).toFixed(2) : '0.00'}</span>
                  </div>
                </div>
              )}
              {gameMode === 'ONLINE_1V1' && (
                 <button
                   onClick={() => {
                     if (socketRef.current) {
                       socketRef.current.disconnect();
                       setSocket(null);
                     }
                     navigate('/lobby/ONLINE_1V1');
                   }}
                   style={{ marginTop: '10px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px' }}
                 >
                   Find New Match
                 </button>
              )}
            </div>
          )}
        </div>
        </div>

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
          {gameMode === '40_LINES' && (
            <div style={{ marginBottom: '20px', backgroundColor: '#222', padding: '10px', borderRadius: '8px', textAlign: 'center', border: '2px solid #555' }}>
              <strong>TIME</strong><br />
              <span style={{ fontSize: '18px', color: finalTime ? 'gold' : 'white', fontVariantNumeric: 'tabular-nums' }}>
                {finalTime ? formatTime(finalTime) : formatTime(elapsedTime)}
              </span>
              {finalTime && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #444' }}>
                  <strong>PPS</strong><br />
                  <span style={{ color: 'white', fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>
                    {(piecesPlaced / (finalTime / 1000)).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>NEXT</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(gameMode === 'ONLINE_1V1' && isWaiting) ? (
                [1,2,3,4,5].map(i => (
                  <div key={i} style={boxStyle} />
                ))
              ) : (
                nextPieceKeys?.map((key, idx) => {
                  const shape = TETROMINOS[key as keyof typeof TETROMINOS].shape;
                  const color = TETROMINOS[key as keyof typeof TETROMINOS].color;
                  return (
                    <div key={idx} style={boxStyle}>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${shape[0].length}, 15px)`, gap: '1px' }}>
                        {shape.map((row, y) => row.map((cell, x) => (
                          <div key={`${y}-${x}`} style={{ width: 15, height: 15, backgroundColor: cell === 0 ? 'transparent' : `${color}`, borderRadius: '2px' }} />
                        )))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          <div style={{
            ...neonSurface,
            padding: '12px 16px',
            display: 'flex', 
            flexDirection: 'column',
            gap: '12px'
          }}>
            {[
              { label: 'SCORE', value: score, color: 'var(--color-neon-cyan)' },
              { label: 'LEVEL', value: level, color: 'var(--color-neon-purple)' },
              { label: 'LINES', value: lines, color: 'var(--color-neon-green)' },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1, color: s.color, fontVariantNumeric: 'tabular-nums',}}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>


        </div>

        {appState !== 'MENU' && gameMode === 'ONLINE_1V1' && (
          <div style={{ position: 'relative', marginLeft: '40px' }}>
            <h3 style={{ textAlign: 'center', color: '#ff4444', margin: '0 0 10px 0' }}>OPPONENT</h3>
            <div style={{ position: 'relative' }}>
              <Stage width={300} height={660} options={{ backgroundAlpha: 0 }}>
                <GameBoard 
                  stage={opponentStage || createStage(10)} 
                  player={{ pos: {x: 0, y:0}, tetromino: [[0]], collided: false, rotationIndex: 0, spawnCount: 0 } as any} 
                  ghostY={0} 
                />
              </Stage>
              
              {isWaiting && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold', textShadow: '2px 2px 4px black', zIndex: 10 }}>
                  Waiting for match...
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <strong>SCORE: {opponentScore}</strong>
            </div>
            {!isWaiting && matchResult && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: matchResult === 'LOSE' ? 'gold' : 'red', fontSize: '32px', fontWeight: 'bold', textShadow: '2px 2px 4px black', zIndex: 20 }}>
                {matchResult === 'LOSE' ? 'WIN' : 'LOSE'}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
    </div>
  );
};
