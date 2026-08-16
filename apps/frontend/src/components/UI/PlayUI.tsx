import React, { useState, useEffect } from 'react';
import { Stage } from '@pixi/react';
import GameBoard from '../GameBoard';
import { calculateGhostY, type Cell } from '../../utils/gameHelpers';
import { TETROMINOS } from '../../utils/tetrominos';
import type { Player } from '../../hooks/usePlayer';
import { Socket } from 'socket.io-client';
import { useAuth } from '../../hooks/useAuth';
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
  setDropTime: (t: number | null) => void;
  setAppState: (s: 'MENU' | 'CONFIG' | 'RECORDS') => void;
  joinOnline: () => void;
  formatTime: (ms: number) => string;
  records: number[];
  createStage: (width?: number) => Cell[][];
  appState?: 'MENU' | 'PLAYING' | 'RECORDS' | 'CONFIG' | 'ONLINE_1V1';
  restartGame: () => void;
};

export const TetrisUI: React.FC<TetrisUIProps> = ({
  stage, player, gameOver, gameMode, score, level, lines, nextPieceKeys, holdInfo,
  isWaiting, matchResult, opponentStage, opponentScore, pendingGarbage, actionText,
  countdown, finalTime, elapsedTime, piecesPlaced, attackLines, socketRef, setSocket, setIsWaiting, setDropTime,
  setAppState, joinOnline, formatTime, records, createStage, appState, restartGame
}) => {
  const [scale, setScale] = useState(1);
  const { token, user, logout } = useAuth();
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
          {(gameMode === 'ONLINE_1V1' && isWaiting) ? <div style={{ width: '80px', height: '80px', backgroundColor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '2px solid #555' }} /> : renderHoldBox()}
          {!(gameMode === 'ONLINE_1V1' && isWaiting) && holdInfo.hasHeld && <span style={{ color: 'gray', fontSize: '12px', marginTop: '5px' }}>Locked</span>}
          
          {(appState === 'PLAYING' || appState === 'ONLINE_1V1') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '30px', width: '100%' }}>
              <button
                onClick={() => {
                  if (socketRef.current) { socketRef.current.disconnect(); setSocket(null); }
                  setIsWaiting(false); setDropTime(null); setAppState('MENU');
                }}
                style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#e53935', color: '#fff', border: 'none', borderRadius: '4px', width: '100%' }}
              >
                Quit
              </button>
              <button 
                onClick={() => setAppState('CONFIG')} 
                style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '4px', width: '100%' }}
              >
                Config
              </button>
            </div>
          )}

          {appState === 'MENU' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '30px', width: '100%' }}>
              <button onClick={() => setAppState('CONFIG')} style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '4px', width: '100%' }}>Config</button>
              <button onClick={() => setAppState('RECORDS')} style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#9b59b6', color: '#fff', border: 'none', borderRadius: '4px', width: '100%' }}>Records</button>
              {token && user ? (
                <>
                  <button onClick={() => navigate(`/dashboard?mode=${gameMode}`)} style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#00bcd4', color: '#fff', border: 'none', borderRadius: '4px', width: '100%' }}>Dashboard</button>
                  <button onClick={() => navigate(`/profile?mode=${gameMode}`)} style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: '4px', width: '100%' }}>Profile</button>
                  <button onClick={() => { logout(); navigate('/'); }} style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px', width: '100%' }}>Logout</button>
                </>
              ) : (
                <button onClick={() => navigate('/login')} style={{ padding: '8px 16px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#e91e63', color: '#fff', border: 'none', borderRadius: '4px', width: '100%' }}>Login</button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 10px 0', visibility: 'hidden' }}>PLAYER</h3>
          <div style={{ position: 'relative', width: stage.length > 0 ? stage[0].length * 30 : 300, height: 660 }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0 }}>
              <Stage width={stage.length > 0 ? stage[0].length * 30 : 300} height={1200} options={{ backgroundAlpha: 0 }}>
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
            </div>

          {appState === 'MENU' && (
            <>
              <div style={{ position: 'absolute', top: '100px', left: 0, width: '100%', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
                 <h2 style={{ color: 'white', fontSize: '32px', letterSpacing: '4px', textShadow: '3px 3px 6px #000', backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px 20px', borderRadius: '8px' }}>DROP TO SELECT MODE</h2>
              </div>
              <div style={{ position: 'absolute', bottom: '150px', left: '15px', width: '990px', display: 'flex', pointerEvents: 'none', zIndex: 10 }}>
                <div style={{ width: '240px', textAlign: 'center', color: '#4caf50', fontWeight: 'bold', fontSize: '20px', textShadow: '2px 2px 4px black' }}>MARATHON</div>
                <div style={{ width: '240px', textAlign: 'center', color: '#ff9800', fontWeight: 'bold', fontSize: '20px', textShadow: '2px 2px 4px black' }}>40 LINES</div>
                <div style={{ width: '240px', textAlign: 'center', color: '#3498db', fontWeight: 'bold', fontSize: '20px', textShadow: '2px 2px 4px black' }}>4-WIDE</div>
                <div style={{ width: '240px', textAlign: 'center', color: '#e74c3c', fontWeight: 'bold', fontSize: '20px', textShadow: '2px 2px 4px black' }}>MULTI PLAY</div>
              </div>
            </>
          )}

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
              backgroundColor: '#111',
              padding: '40px',
              border: '6px solid #fff',
              zIndex: 50,
              minWidth: '400px',
              boxShadow: '15px 15px 0px rgba(0,0,0,0.8)'
            }}>
              <h2 style={{ color: matchResult === 'WIN' ? 'gold' : 'red', margin: '0 0 25px 0', fontSize: '32px', fontFamily: '"Press Start 2P", monospace', textShadow: '4px 4px 0px rgba(0,0,0,0.5)', lineHeight: '1.4' }}>
                {gameMode === 'ONLINE_1V1' && matchResult
                  ? matchResult === 'WIN' ? 'YOU WIN!' : 'YOU LOSE'
                  : (lines >= 40 && gameMode === '40_LINES' ? 'FINISHED!' : 'GAME OVER')
                }
              </h2>
              {gameMode === '40_LINES' && finalTime && (
                <div style={{ marginBottom: '25px', fontFamily: '"Press Start 2P", monospace', fontSize: '14px', lineHeight: '1.8' }}>
                  <div style={{ color: '#aaa' }}>TIME: <span style={{ color: '#fff' }}>{formatTime(finalTime)}</span></div>
                  {records.indexOf(finalTime) !== -1 && records.indexOf(finalTime) < 10 && (
                    <div style={{ color: 'gold', animation: 'pop 0.5s ease-out', marginTop: '10px' }}>
                      NEW RECORD! RANK {records.indexOf(finalTime) + 1}
                    </div>
                  )}
                </div>
              )}
              {gameMode === 'ONLINE_1V1' && matchResult && (
                <div style={{ color: 'white', fontSize: '14px', fontFamily: '"Press Start 2P", monospace', display: 'flex', justifyContent: 'space-around', margin: '25px 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ color: '#aaa', fontSize: '10px' }}>APM</span><br/><br/>
                    <span>{elapsedTime > 0 ? (attackLines / (elapsedTime / 60000)).toFixed(1) : '0.0'}</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ color: '#aaa', fontSize: '10px' }}>PPS</span><br/><br/>
                    <span>{elapsedTime > 0 ? (piecesPlaced / (elapsedTime / 1000)).toFixed(2) : '0.00'}</span>
                  </div>
                </div>
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px' }}>
                {gameMode === 'ONLINE_1V1' ? (
                  <button
                    onClick={() => {
                      if (socketRef.current) { socketRef.current.disconnect(); setSocket(null); }
                      joinOnline();
                    }}
                    style={{ fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', color: '#fff', border: '4px solid #4caf50', boxShadow: '4px 4px 0px rgba(76,175,80,0.5)', cursor: 'pointer', textTransform: 'uppercase', fontSize: '14px', transition: 'transform 0.1s' }}
                    onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                    onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                  >
                    FIND NEW MATCH
                  </button>
                ) : (
                  <button 
                    onClick={() => restartGame()}
                    style={{ fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', color: '#fff', border: '4px solid #4caf50', boxShadow: '4px 4px 0px rgba(76,175,80,0.5)', cursor: 'pointer', textTransform: 'uppercase', fontSize: '14px', transition: 'transform 0.1s' }}
                    onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                    onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                  >
                    RETRY
                  </button>
                )}
                
                <button 
                  onClick={() => navigate('/menu')}
                  style={{ fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', color: '#fff', border: '4px solid #e74c3c', boxShadow: '4px 4px 0px rgba(231,76,60,0.5)', cursor: 'pointer', textTransform: 'uppercase', fontSize: '14px', transition: 'transform 0.1s' }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                >
                  QUIT (TOP)
                </button>
              </div>
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
                  <div key={i} style={{ width: '80px', height: '80px', backgroundColor: '#333', borderRadius: '8px', border: '2px solid #555' }} />
                ))
              ) : (
                nextPieceKeys?.map((key, idx) => {
                  const shape = TETROMINOS[key as keyof typeof TETROMINOS].shape;
                  const color = TETROMINOS[key as keyof typeof TETROMINOS].color;
                  const boxStyle = {
                    width: '80px', height: '80px', backgroundColor: '#333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '8px', border: '2px solid #555'
                  };
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
          <div><strong>SCORE</strong><br />{score}</div>
          <div><strong>LEVEL</strong><br />{level}</div>
          <div><strong>LINES</strong><br />{lines}</div>
        </div>

        {appState !== 'MENU' && gameMode === 'ONLINE_1V1' && (
          <div style={{ position: 'relative', marginLeft: '40px' }}>
            <h3 style={{ textAlign: 'center', color: '#ff4444', margin: '0 0 10px 0' }}>OPPONENT</h3>
            <div style={{ position: 'relative', width: 300, height: 660 }}>
              <div style={{ position: 'absolute', bottom: 0, left: 0 }}>
                <Stage width={300} height={1200} options={{ backgroundAlpha: 0 }}>
                  <GameBoard 
                    stage={opponentStage || createStage(10)} 
                    player={{ pos: {x: 0, y:0}, tetromino: [[0]], collided: false, rotationIndex: 0, spawnCount: 0 } as any} 
                    ghostY={0} 
                  />
                </Stage>
              </div>
              
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
