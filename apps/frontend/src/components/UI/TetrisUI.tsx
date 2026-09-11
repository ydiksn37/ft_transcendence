import React, { useState, useEffect } from 'react';
import { Stage } from '@pixi/react';
import GameBoard from '../GameBoard';
import { calculateGhostY, type Cell } from '../../utils/gameHelpers';
import { TETROMINOS } from '../../utils/tetrominos';
import type { Player } from '../../hooks/usePlayer';
import { Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

import campuses from "../../assets/images/campuses.json"

import { colorMap } from "../Cell"
import { soundManager } from '../../utils/soundManager';
import './TetrisUI.css';

type TetrisUIProps = {
  stage: Cell[][];
  player: Player;
  gameOver: boolean;
  gameMode: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1' | 'AI_PREVIEW';
  score: number;
  level: number;
  lines: number;
  nextPieceKeys: string[];
  holdInfo: { tetromino: string | null; hasHeld: boolean };
  isWaiting: boolean;
  connectionError: string | null;
  matchResult: 'WIN' | 'LOSE' | null;
  opponentStage: Cell[][] | null;
  opponentScore: number;
  opponentNextPieceKeys?: string[];
  opponentHoldMino?: string | null;
  opponents?: Record<string, { stage: Cell[][]; score: number; nextPieceKeys?: string[]; holdMino?: string | null; isGameOver?: boolean }>;
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
  createStage: (width?: number) => Cell[][];
  appState?: 'MENU' | 'PLAYING' | 'RECORDS' | 'CONFIG' | 'ONLINE_1V1' | 'CUSTOM_ROOMS' | 'SPECTATING';
  restartGame: () => void;
  joinOnline?: () => void;
  isCustomRoom?: boolean;
  isVsAi?: boolean;
  quitGame?: () => void;
  onlineRestartLabel?: string;
  onHold: () => void;
  onQuit?: () => void;
  extraLeftPanel?: React.ReactNode;
  ghostYOverride?: number;
  onSpectate?: () => void;
};

export const TetrisUI: React.FC<TetrisUIProps> = ({
  stage, player, gameOver, gameMode, score, level, lines, nextPieceKeys, holdInfo,
  isWaiting, connectionError, matchResult, opponentStage, opponentScore, opponentNextPieceKeys, opponentHoldMino, opponents, pendingGarbage, actionText,
  countdown, finalTime, elapsedTime, piecesPlaced, attackLines, socketRef, setSocket, setIsWaiting, setDropTime,
  formatTime, createStage, appState, restartGame, joinOnline, isCustomRoom, isVsAi, quitGame,
  onlineRestartLabel, onHold, onQuit, onSpectate, extraLeftPanel, ghostYOverride
}) => {
  const [scale, setScale] = useState(1);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      // 1200px is approximately the required vertical height.
      // 700px width for solo mode, 1200px width for 1v1 mode.
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const isMobile = vw <= 768;
      setIsMobileView(isMobile);
      
      const expectedHeight = isMobile ? 750 : 800;
      const scaleY = (vh - 40) / expectedHeight;
      // 観戦時: 各盤面はフルサイズ(560px)で並ぶ → 2人なら 560*2+gap≈1160, 1人なら 560
      // 通常1v1: 自分+相手で 1100px, ソロ: 700px
      const expectedWidth = isMobile
        ? (gameMode === 'ONLINE_1V1' && appState !== 'SPECTATING' ? 550 : 460)
        : (appState === 'SPECTATING' ? 1160 : gameMode === 'ONLINE_1V1' ? 1100 : gameMode === 'AI_PREVIEW' ? 850 : 700);
      const scaleX = (vw - 20) / expectedWidth;
      setScale(Math.min(1.5, scaleY, scaleX));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [gameMode, appState]);

  useEffect(() => {
    if (!gameOver) return;
    const handleGameOverKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onQuit) onQuit();
        else navigate('/menu');
      } else if (e.key === 'Enter') {
        if (isCustomRoom) {
          if (quitGame) quitGame();
        } else if (gameMode === 'ONLINE_1V1') {
          if (joinOnline) joinOnline();
          else navigate('/lobby/MULTI_PLAY');
        } else {
          restartGame();
        }
      }
    };
    window.addEventListener('keydown', handleGameOverKeys);
    return () => window.removeEventListener('keydown', handleGameOverKeys);
  }, [gameOver, navigate, onQuit, isCustomRoom, quitGame, gameMode, joinOnline, restartGame]);


  const retroBoxStyle: React.CSSProperties = {
    backgroundColor: '#000',
    border: '4px solid #fff',
    boxShadow: '4px 4px 0px rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '80px', height: '80px',
  }

  const renderHoldBox = (mino: string | null) => {
    if (!mino) {
      return <div style={retroBoxStyle}></div>;
    }

    const shape = TETROMINOS[mino as keyof typeof TETROMINOS].shape;
    const color = TETROMINOS[mino as keyof typeof TETROMINOS].color;

    return (
      <div style={retroBoxStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${shape[0].length}, 15px)`, gap: '1px' }}>
          {shape.map((row, y) => row.map((cell, x) => (
            <div key={`${y}-${x}`} style={{ width: 15, height: 15, backgroundColor: cell === 0 ? 'transparent' : "#" + colorMap[color].toString(16).padStart(6,'0'), borderRadius: '2px',
              backgroundImage: cell === 0 ? undefined: 'linear-gradient(135deg, rgba(ffffff,0.22), rgba(255,255,255,0.04) 42%, rgba(0,0,0,0.05) 58%, rgba(0,0,0,0.28))',
              boxShadow: cell === 0 ? undefined: 'inset 1px 1px 1px rgba(255,255,255,0.16), inset -1px -1px 1px rgba(0,0,0,0.22)',
            }} />
          )))}
        </div>
      </div>
    );
  };

  const modeMeta = (() => {
    if (appState === 'SPECTATING') {
      return { label: 'SPECTATING MATCH', color: '#f1c40f' };
    }
    return ({
      'MARATHON':   { label: 'MARATHON',     color: 'var(--color-neon-cyan)' },
      '40_LINES':   { label: '40 LINES',     color: 'var(--color-neon-cyan)' },
      '4_WIDE':     { label: '4 WIDE',       color: 'var(--color-neon-cyan)' },
      'ONLINE_1V1': { label: 'ONLINE MATCH', color: 'var(--color-neon-magenta)' },
      'AI_PREVIEW': { label: 'AI PREVIEW',   color: 'var(--color-neon-cyan)' },
    } as const)[gameMode] ?? { label: gameMode, color: 'var(--color-neon-cyan)' };
  })();

  const modules = import.meta.glob<string>(
    "../../assets/images/tetrisbg_*.png",
    { import: "default" }
  );

  const [ bg, setBg ] = useState<{ image: string; campus: typeof campuses[0]} | null>(null);
  useEffect(() => {
    const picked = campuses[Math.floor(Math.random() * campuses.length)];
    const loader = modules["../../assets/images/" + picked.file];
    if (!loader)
        return ;
    loader().then((image) => {setBg({image, campus: picked})});
  }, [])

  if (gameMode === 'ONLINE_1V1' && connectionError) {
    return (
      <div style={{
        width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundImage: `linear-gradient(rgba(6,0,15,0.72), rgba(6,0,15,0.72)), url(${bg?.image})`,
        backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        fontFamily: '"Press Start 2P", monospace', color: 'white'
      }}>
        <h1 style={{ fontSize: '36px', color: '#e74c3c', textShadow: '4px 4px 0px #000', marginBottom: '24px', textAlign: 'center', lineHeight: '1.5' }}>
          CONNECTION ERROR
        </h1>
        <p style={{ fontSize: '14px', lineHeight: '1.8', textAlign: 'center' }}>{connectionError}</p>
        <button
          onClick={() => {
            socketRef.current?.disconnect();
            setSocket(null);
            navigate('/lobby/MULTI_PLAY');
          }}
          style={{
            fontFamily: '"Press Start 2P", monospace', padding: '16px 32px', marginTop: '24px',
            backgroundColor: '#000', color: '#fff', border: '4px solid #fff', cursor: 'pointer'
          }}
        >
          BACK
        </button>
      </div>
    );
  }

  if (gameMode === 'ONLINE_1V1' && isWaiting) {
    return (
      <div style={{
        width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundImage: `linear-gradient(rgba(6,0,15,0.72), rgba(6,0,15,0.72)), url(${bg?.image})`,
        backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        fontFamily: '"Press Start 2P", monospace', color: 'white'
      }}>
        <h1 style={{ fontSize: '48px', color: '#e74c3c', textShadow: '4px 4px 0px #000', marginBottom: '40px', animation: 'blink 1s infinite alternate', textAlign: 'center', lineHeight: '1.5' }}>
          {isVsAi ? <>LOADING<br/>AI...</> : <>SEARCHING FOR<br/>OPPONENT...</>}
        </h1>
        <button
          onClick={() => {
            if (socketRef.current) { socketRef.current.disconnect(); setSocket(null); }
            navigate(isVsAi ? '/lobby/VS_AI' : '/lobby/MULTI_PLAY');
          }}
          style={{
            fontFamily: '"Press Start 2P", monospace', padding: '20px 40px',
            backgroundColor: '#000', color: '#fff', border: '4px solid #fff',
            boxShadow: '4px 4px 0px rgba(255,255,255,0.5)', cursor: 'pointer',
            fontSize: '18px', transition: 'transform 0.1s', marginTop: '20px'
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
        >
          CANCEL
        </button>
      </div>
    );
  }

  const holdBlock = (
    <div 
      className="hold-button"
      onClick={() => {
        if (isMobileView && gameMode !== 'AI_PREVIEW') {
          onHold();
          soundManager.playSe('hold');
        }
      }}
      onTouchEnd={(e) => {
        if (isMobileView && gameMode !== 'AI_PREVIEW') {
          e.preventDefault();
          onHold();
          soundManager.playSe('hold');
        }
      }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: isMobileView && gameMode !== 'AI_PREVIEW' ? 'pointer' : 'default' }}
    >
      <h3 style={{ margin: isMobileView ? '0 0 5px 0' : '0 0 15px 0', fontFamily: '"Press Start 2P", monospace', fontSize: isMobileView ? '10px' : '14px', textShadow: '2px 2px 0px #000' }}>HOLD</h3>
      {(gameMode === 'ONLINE_1V1' && isWaiting) ? <div style={retroBoxStyle} /> : renderHoldBox(holdInfo.tetromino)}
      {!(gameMode === 'ONLINE_1V1' && isWaiting) &&
        !isMobileView &&
        (holdInfo.hasHeld || gameMode === 'AI_PREVIEW') && (
          <span
            style={{
              color: 'gray',
              fontSize: '10px',
              marginTop: '10px',
              fontFamily: '"Press Start 2P", monospace',
              visibility: holdInfo.hasHeld ? 'visible' : 'hidden',
            }}
          >
            LOCKED
          </span>
        )}
    </div>
  );

  const renderNextPieces = (keys: string[] | undefined, count: number = 5) => {
    if (gameMode === 'ONLINE_1V1' && isWaiting) {
      return Array.from({ length: count }).map((_, i) => <div key={i} style={retroBoxStyle} />);
    }
    return keys?.slice(0, count).map((key, idx) => {
      const shape = TETROMINOS[key as keyof typeof TETROMINOS].shape;
      const color = TETROMINOS[key as keyof typeof TETROMINOS].color;
      return (
        <div key={idx} style={retroBoxStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${shape[0].length}, 15px)`, gap: '1px' }}>
            {shape.map((row, y) => row.map((cell, x) => (
              <div
                key={`${y}-${x}`}
                style={{ width: 15, height: 15, backgroundColor: cell === 0 ? 'transparent' : "#" + colorMap[color].toString(16).padStart(6,'0'), borderRadius: '2px', 
                  backgroundImage: cell === 0 ? undefined: 'linear-gradient(135deg, rgba(ffffff,0.22), rgba(255,255,255,0.04) 42%, rgba(0,0,0,0.05) 58%, rgba(0,0,0,0.28))',
                  boxShadow: cell === 0 ? undefined: 'inset 1px 1px 1px rgba(255,255,255,0.16), inset -1px -1px 1px rgba(0,0,0,0.22)',
                }} 
              />
            )))}
          </div>
        </div>
      );
    });
  };

  const quitButton = appState !== 'MENU' ? (
    <button
      tabIndex={gameOver ? -1 : 0}
      onClick={() => {
        if (onQuit) { onQuit(); return; }
        if (socketRef.current) { socketRef.current.disconnect(); setSocket(null); }
        setIsWaiting(false); setDropTime(null); 
        navigate(`/lobby/${gameMode}`);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        if (onQuit) { onQuit(); return; }
        if (socketRef.current) { socketRef.current.disconnect(); setSocket(null); }
        setIsWaiting(false); setDropTime(null); 
        navigate(`/lobby/${gameMode}`);
      }}
      style={{
        fontFamily: '"Press Start 2P", monospace', padding: '12px',
        backgroundColor: '#000', color: '#fff', border: '4px solid #e74c3c',
        boxShadow: '4px 4px 0px rgba(231,76,60,0.5)', cursor: 'pointer', fontSize: '12px',
        transition: 'transform 0.1s', position: 'relative', zIndex: 100
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
      onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
    >
      {isCustomRoom && gameOver ? 'RETURN TO ROOM' : 'QUIT'}
    </button>
  ) : null;

  const renderTimeBlock = () => {
    if (gameMode !== '40_LINES') return null;
    const timeStr = formatTime(finalTime || elapsedTime);
    const parts = timeStr.split('.');

    return (
      <div style={{ 
        marginTop: isMobileView ? '5px' : '20px',
        textAlign: 'center', 
        fontFamily: '"Press Start 2P", monospace',
        color: finalTime ? 'gold' : 'white',
        backgroundColor: '#000',
        padding: isMobileView ? '4px' : '10px',
        border: isMobileView ? '2px solid #555' : '4px solid #fff',
        boxShadow: isMobileView ? 'none' : '4px 4px 0px rgba(0,0,0,0.8)',
        fontSize: isMobileView ? '10px' : '14px',
        position: isMobileView ? 'absolute' : 'static',
        top: isMobileView ? '100%' : 'auto',
        left: isMobileView ? '0' : 'auto',
        width: isMobileView ? '100%' : 'auto',
        boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: isMobileView ? '8px' : '10px', color: 'gray', marginBottom: isMobileView ? '2px' : '4px' }}>TIME</div>
        <div>
          {parts[0]}
          {parts[1] && <span style={{ fontSize: isMobileView ? '6px' : '9px', color: '#aaa' }}>.{parts[1]}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="tetris-ui-container" style={{
      backgroundImage: `linear-gradient(rgba(6,0,15,0.72), rgba(6,0,15,0.72)), url(${bg?.image})`
     }}>
      <div className="tetris-ui-content">
        <div className="tetris-ui-scaling-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${scale})`, transformOrigin: isMobileView ? 'top center' : 'center center' }}>
          <style>{`
            @keyframes pop {
              0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
              70% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
              100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
          `}</style>
          

          {appState !== 'MENU' && !isMobileView && (
            <h2 style={{ 
              margin: '0 0 30px 0', textAlign: 'center', fontFamily: '"Press Start 2P", monospace',
              color: modeMeta.color, textShadow: '4px 4px 0px #000', fontSize: '24px', letterSpacing: '2px'
            }}>
              {modeMeta.label}
            </h2>
          )}

          {appState !== 'MENU' && isMobileView && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '380px', marginBottom: '10px' }}>
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {quitButton}
                {renderTimeBlock()}
              </div>
              <h2 style={{ 
                margin: '0', textAlign: 'center', fontFamily: '"Press Start 2P", monospace',
                color: modeMeta.color, textShadow: '2px 2px 0px #000', fontSize: '16px', letterSpacing: '1px'
              }}>
                {modeMeta.label}
              </h2>
              {holdBlock}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: isMobileView ? 'column' : 'row', gap: isMobileView ? '20px' : '40px', justifyContent: 'center', alignItems: isMobileView ? 'center' : 'flex-start', width: '100%' }}>
          {appState !== 'SPECTATING' && (
          <div className="tetris-ui-layout touch-flick-area">
          {(
            <>
              {!isMobileView && (
                <div className="tetris-side-panel">
                  {holdBlock}
                  {extraLeftPanel}
                  {quitButton}
                  {renderTimeBlock()}
                </div>
              )}
          <div className="tetris-board-container">
              {gameMode === 'ONLINE_1V1' ? (
                <h3 style={{ textAlign: 'center', color: '#4caf50', margin: '0 0 10px 0', fontFamily: '"Press Start 2P", monospace', fontSize: '14px' }}>YOU</h3>
              ) : (
                <h3 style={{ margin: '0 0 10px 0', visibility: 'hidden' }}>PLAYER</h3>
              )}
            <div style={{ position: 'relative', width: stage.length > 0 ? stage[0].length * 30 : 300, height: 660 }}>
              <div style={{ position: 'absolute', bottom: 0, left: 0 }}>
                <Stage 
                  width={stage.length > 0 ? stage[0].length * 30 : 300} 
                  height={1200} 
                  options={{ backgroundAlpha: 0 }}
                  onMount={(app) => {
                    const canvas = app.view as HTMLCanvasElement;
                    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
                    canvas.addEventListener('webglcontextrestored', () => app.renderer.reset());
                  }}
                >
                  <GameBoard 
                    stage={stage} 
                    player={(gameMode === 'ONLINE_1V1' && isWaiting) || gameOver ? { pos: {x: 0, y:0}, tetromino: [[0]], collided: false, rotationIndex: 0, spawnCount: 0 } as any : player} 
                    ghostY={(gameMode === 'ONLINE_1V1' && isWaiting) || gameOver ? 0 : (ghostYOverride ?? calculateGhostY(player, stage))}
                    targetLine={
                      gameMode === '40_LINES' && (40 - lines) <= 20 && (40 - lines) > 0 
                        ? 22 - (40 - lines) 
                        : undefined
                    }
                  />
                </Stage>
              </div>

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

          <div className="tetris-right-panel">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '30px' }}>
              <h3 style={{ margin: '0 0 15px 0', fontFamily: '"Press Start 2P", monospace', fontSize: '14px', textShadow: '2px 2px 0px #000' }}>NEXT</h3>
              <div className="next-pieces-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {renderNextPieces(nextPieceKeys, 5)}
              </div>
            </div>

            <div className="score-container" style={{
              backgroundColor: '#000',
              border: '4px solid #fff',
              boxShadow: '4px 4px 0px rgba(0,0,0,0.8)',
              padding: '20px 16px',
              display: 'flex', 
              flexDirection: 'column',
              gap: '20px',
              fontFamily: '"Press Start 2P", monospace'
            }}>
              {[
                { label: 'SCORE', value: score, color: 'var(--color-neon-cyan)' },
                { label: 'LEVEL', value: level, color: 'var(--color-neon-purple)' },
                { label: 'LINES', value: lines, color: 'var(--color-neon-green)' },
              ].map((s) => (
                <div key={s.label} className="score-item">
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 900, lineHeight: 1, color: s.color, fontVariantNumeric: 'tabular-nums', textShadow: '2px 2px 0px #000'}}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
          )}
        </div>
          )}

        {bg?.campus && !isMobileView && (
          <div style={{
            position: 'absolute',
            left: '100%', 
            bottom: 0,
            marginLeft: '20px',
            alignSelf: 'flex-start',
            width: '220px',
            backgroundColor: '#0000007c',
            // border: '4px solid #fff',
            // boxShadow: '4px 4px 0px rgba(0,0,0,0.8)',
            padding: '16px',
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '9px',
            lineHeight: 2,
            color: '#fff',
          }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', marginBottom: '12px' }}>
              CAMPUS
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-neon-cyan)', textShadow: '2px 2px 0px #000' }}>
              {bg?.campus.flag} {bg?.campus.campus}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)' }}>{bg?.campus.country}</div>
            <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, marginTop: '8px', wordBreak: 'break-word' }}>
              {bg?.campus.address}
            </div>
            {bg?.campus.url && (
              <a 
                href={bg?.campus.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', marginTop: '8px', fontSize: '7px', color: 'var(--color-neon-magenta)', wordBreak: 'break-all' }}
              >
                {bg?.campus.url}
              </a>
            )}
          </div>
         )}

        {appState !== 'MENU' && gameMode === 'ONLINE_1V1' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: appState === 'SPECTATING' ? '100%' : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', width: appState === 'SPECTATING' ? '100%' : undefined, maxWidth: appState === 'SPECTATING' ? 'none' : '600px' }}>
              {(() => {
              const numOpp = Math.max(1, Object.keys(opponents || {}).length);
              // 観戦時は通常対戦と同じフルサイズで表示する
              // 通常対戦時のみ人数に応じて縮小する (1人: 1.0, 2人: 0.55, 3人: 0.45...)
              const oppScale = appState === 'SPECTATING'
                ? 1
                : (numOpp === 1 ? 1 : (numOpp === 2 ? 0.55 : 0.45));
              const oppWidth = 560; // 本来の幅 (300 + 80 + 80 + gaps)
              const oppHeight = 700; // 本来の高さ

              const renderOpponent = (id: string, opp: any, index: number, isFallback: boolean = false) => (
                <div key={id} style={{ width: `${oppWidth * oppScale}px`, height: `${oppHeight * oppScale}px`, position: 'relative' }}>
                  <div style={{
                    transform: `scale(${oppScale})`, transformOrigin: 'top left',
                    display: 'flex', flexDirection: 'row', gap: '20px', position: 'absolute', top: 0, left: 0, width: `${oppWidth}px`, height: `${oppHeight}px`
                  }}>
                    {/* 相手の 左パネル (HOLD) */}
                    {!isMobileView && (
                      <div className="tetris-side-panel">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <h3 style={{ margin: '0 0 15px 0', fontFamily: '"Press Start 2P", monospace', fontSize: '14px', textShadow: '2px 2px 0px #000' }}>HOLD</h3>
                          {(!isWaiting) ? renderHoldBox(opp.holdMino || null) : <div style={retroBoxStyle} />}
                        </div>
                      </div>
                    )}

                    {/* 相手の 中央パネル (GameBoard) */}
                    <div className="tetris-board-container">
                      <h3 style={{ textAlign: 'center', color: '#e74c3c', margin: '0 0 10px 0', fontFamily: '"Press Start 2P", monospace', fontSize: '14px' }}>
                        OPPONENT {isFallback ? '' : index + 1}
                      </h3>
                      <div style={{ position: 'relative', width: 300, height: 660 }}>
                        <div style={{ position: 'absolute', bottom: 0, left: 0 }}>
                          <Stage 
                            width={300} 
                            height={1200} 
                            options={{ backgroundAlpha: 0 }}
                            onMount={(app) => {
                              const canvas = app.view as HTMLCanvasElement;
                              canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
                              canvas.addEventListener('webglcontextrestored', () => app.renderer.reset());
                            }}
                          >
                            <GameBoard 
                              stage={opp.stage || createStage(10)} 
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
                        
                        {opp.isGameOver && (
                          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'red', fontSize: '32px', fontWeight: 'bold', textShadow: '2px 2px 4px black', zIndex: 15 }}>
                            GAME OVER
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 相手の 右パネル (NEXT & SCORE) */}
                    <div className="tetris-right-panel">
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '30px' }}>
                        <h3 style={{ margin: '0 0 15px 0', fontFamily: '"Press Start 2P", monospace', fontSize: '14px', textShadow: '2px 2px 0px #000' }}>NEXT</h3>
                        <div className="next-pieces-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {renderNextPieces(opp.nextPieceKeys || [], 5)}
                        </div>
                      </div>

                      <div className="score-container" style={{
                        backgroundColor: '#000',
                        border: '4px solid #fff',
                        boxShadow: '4px 4px 0px rgba(0,0,0,0.8)',
                        padding: '20px 16px',
                        display: 'flex', 
                        flexDirection: 'column',
                        gap: '20px',
                        fontFamily: '"Press Start 2P", monospace'
                      }}>
                        <div className="score-item">
                          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>SCORE</div>
                          <div style={{ fontSize: '20px', fontWeight: 900, lineHeight: 1, color: 'var(--color-neon-cyan)', fontVariantNumeric: 'tabular-nums', textShadow: '2px 2px 0px #000'}}>
                            {opp.score || 0}
                          </div>
                        </div>
                      </div>

                      {/* 1対1用のフォールバック時のみ表示される古い判定名残（必要なら表示） */}
                      {!isWaiting && matchResult && isFallback && (
                        <div style={{ marginTop: '20px', textAlign: 'center', color: matchResult === 'LOSE' ? 'gold' : 'red', fontSize: '32px', fontWeight: 'bold', textShadow: '2px 2px 4px black' }}>
                          {matchResult === 'LOSE' ? 'WIN' : 'LOSE'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );

              return Object.keys(opponents || {}).length > 0
                ? Object.entries(opponents!).map(([id, opp], index) => renderOpponent(id, opp, index))
                : renderOpponent('fallback', { stage: opponentStage, score: opponentScore, nextPieceKeys: opponentNextPieceKeys, holdMino: opponentHoldMino }, 0, true);
            })()}
            </div>
          </div>
        )}
        </div>

      </div>
      {bg?.campus && !isMobileView && (
        <div
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '8px',
            color: "#fff",
            position: 'absolute',
            bottom: '0'
          }}
        >
          <p><a href={bg.campus.url} target="_blank" rel="noreferrer" style={{color: "#fff", textDecoration: 'none'}}>{bg.campus.flag} {bg.campus.country} |  {bg.campus.campus}</a></p>
        </div>
      )}
              {countdown && appState !== 'SPECTATING' && (
            <div style={{
              position: 'fixed',
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
              position: 'fixed',
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
                {isCustomRoom ? (
                  <>
                    <button
                      autoFocus
                      onClick={() => {
                        if (quitGame) {
                          quitGame();
                        }
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        if (quitGame) {
                          quitGame();
                        }
                      }}
                      style={{ fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', color: '#fff', border: '4px solid #4caf50', boxShadow: '4px 4px 0px rgba(76,175,80,0.5)', cursor: 'pointer', textTransform: 'uppercase', fontSize: '14px', transition: 'transform 0.1s' }}
                      onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                      onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                    >
                      {isMobileView ? 'RETURN TO ROOM' : 'RETURN TO ROOM (ENTER)'}
                    </button>
                    {onSpectate && (
                      <button
                        onClick={() => onSpectate()}
                        onTouchEnd={(e) => { e.preventDefault(); onSpectate(); }}
                        style={{ fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', color: '#fff', border: '4px solid #3498db', boxShadow: '4px 4px 0px rgba(52,152,219,0.5)', cursor: 'pointer', textTransform: 'uppercase', fontSize: '14px', transition: 'transform 0.1s' }}
                        onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                        onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                      >
                        SPECTATE MATCH
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {gameMode === 'ONLINE_1V1' ? (
                      <button
                        autoFocus
                        onClick={() => {
                          if (joinOnline) {
                            joinOnline();
                          } else {
                            navigate('/lobby/MULTI_PLAY');
                          }
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          if (joinOnline) {
                            joinOnline();
                          } else {
                            navigate('/lobby/MULTI_PLAY');
                          }
                        }}
                        style={{ fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', color: '#fff', border: '4px solid #4caf50', boxShadow: '4px 4px 0px rgba(76,175,80,0.5)', cursor: 'pointer', textTransform: 'uppercase', fontSize: '14px', transition: 'transform 0.1s' }}
                        onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                        onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                      >
                        {isMobileView ? 'FIND NEW MATCH' : (onlineRestartLabel ?? 'FIND NEW MATCH (ENTER)')}
                      </button>
                    ) : (
                      <button 
                        autoFocus
                        onClick={() => restartGame()}
                        onTouchEnd={(e) => { e.preventDefault(); restartGame(); }}
                        style={{ fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', color: '#fff', border: '4px solid #4caf50', boxShadow: '4px 4px 0px rgba(76,175,80,0.5)', cursor: 'pointer', textTransform: 'uppercase', fontSize: '14px', transition: 'transform 0.1s' }}
                        onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                        onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                      >
                        {isMobileView ? 'RETRY' : 'RETRY (ENTER)'}
                      </button>
                    )}
                    
                    <button 
                      onClick={() => {
                        if (onQuit) onQuit();
                        else if (quitGame) quitGame();
                        else navigate('/menu');
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        if (onQuit) onQuit();
                        else if (quitGame) quitGame();
                        else navigate('/menu');
                      }}
                      style={{ fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', color: '#fff', border: '4px solid #e74c3c', boxShadow: '4px 4px 0px rgba(231,76,60,0.5)', cursor: 'pointer', textTransform: 'uppercase', fontSize: '14px', transition: 'transform 0.1s' }}
                      onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                      onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                    >
                      {isMobileView ? 'QUIT' : 'QUIT (ESC)'}
                    </button>
                  </>
                )}

              </div>
            </div>
          )}
</div>
    </div>
  );
};
