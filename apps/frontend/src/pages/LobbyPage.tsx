import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AI_DIFFICULTIES, type AiDifficulty } from '@transcendence/shared';
import { Config } from '../components/UI/Config';
import { Records } from '../components/UI/Records';
import { useAuth } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import './LobbyPage.css';

const MAX_AI_ACTION_DELAY_MS = 250;
const AI_DIFFICULTY_COLORS: Record<AiDifficulty, string> = {
  EASY: '#2ecc71',
  HARD: '#f1c40f',
  EXPERT: '#9b59b6',
};

export default function LobbyPage() {
  const { mode } = useParams<{ mode: string }>();
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();
  
  const [startLevel, setStartLevel] = useState(1);
  const [aiSpeedPercent, setAiSpeedPercent] = useState(80);
  const [selectedAiDifficulty, setSelectedAiDifficulty] = useState<AiDifficulty | null>(null);
  const aiActionDelayMs = Math.round(
    MAX_AI_ACTION_DELAY_MS * (1 - aiSpeedPercent / 100),
  );
  const [selectedIndex, setSelectedIndex] = useState(0); // 0: START GAME, 1: ACTION (Register/Login or Dashboard)
  const { tuning, setTuning, keyConfig, listeningAction, setListeningAction, volume, setVolume } = useConfig();

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [showMobileConfig, setShowMobileConfig] = useState(false);
  const [targetPlayPath, setTargetPlayPath] = useState('');

  const handleStartGame = (path: string) => {
    if (isMobile) {
      setTargetPlayPath(path);
      setShowMobileConfig(true);
    } else {
      navigate(path);
    }
  };

  useEffect(() => {
    if (mode === 'ONLINE_1V1' || mode === 'CUSTOM_ROOMS' || mode === 'VS_AI') {
      navigate('/lobby/MULTI_PLAY', { replace: true });
    }
  }, [mode, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (listeningAction) return;

      if (selectedAiDifficulty) {
        if (e.code === 'Escape' || e.code === keyConfig.quitToMenu) {
          e.preventDefault();
          setSelectedAiDifficulty(null);
        }
        return;
      }

      if (e.code === keyConfig.quitToMenu) {
        navigate('/menu');
        return;
      }

      const maxIndex = (token && user) ? 3 : 1;

      if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS') {
        if (mode !== 'CONFIG') {
          e.preventDefault();
          if (selectedIndex === 0) {
            setSelectedIndex(1);
          } else {
            setSelectedIndex(0);
          }
        }
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (selectedIndex > 1) {
          e.preventDefault();
          setSelectedIndex(prev => prev - 1);
        } else if (selectedIndex === 0 && mode === 'MARATHON') {
          e.preventDefault();
          setStartLevel(prev => prev === 1 ? 1 : (prev === 5 ? 1 : prev - 5));
        }
      }

      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (selectedIndex >= 1 && selectedIndex < maxIndex) {
          e.preventDefault();
          setSelectedIndex(prev => prev + 1);
        } else if (selectedIndex === 0 && mode === 'MARATHON') {
          e.preventDefault();
          setStartLevel(prev => prev === 1 ? 5 : Math.min(100, prev + 5));
        }
      }

      if (e.code === 'Enter') {
        if (mode === 'CONFIG') return;
        if (mode === 'MULTI_PLAY' && selectedIndex === 0) return;
        
        if (selectedIndex === 0) {
          navigate(`/play/${mode}?level=${startLevel}`);
        } else if (selectedIndex === 1) {
          if (!token || !user) {
            navigate(`/login?redirectTo=/lobby/${mode}&cancelTo=/lobby/${mode}`);
          } else {
            navigate(`/dashboard?mode=${mode}`);
          }
        } else if (selectedIndex === 2) {
          navigate(`/profile?mode=${mode}`);
        } else if (selectedIndex === 3) {
          logout();
          navigate('/');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, startLevel, navigate, keyConfig.quitToMenu, listeningAction, selectedIndex, selectedAiDifficulty, token, user]);

  const [records, setRecords] = useState<any[]>([]);
  const [myRecords, setMyRecords] = useState<any[]>([]);
  const [recordTab, setRecordTab] = useState<'MY' | 'GLOBAL'>('MY');

  useEffect(() => {
    if (mode === '40_LINES') {
      const fetchLeaderboard = async () => {
        try {
          const res = await fetch(`/api/sprint/leaderboard`);
          if (res.ok) {
            const data = await res.json();
            setRecords(data);
          }
          if (token) {
            const resMe = await fetch(`/api/sprint/me`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (resMe.ok) {
              const dataMe = await resMe.json();
              setMyRecords(dataMe);
            }
          }
        } catch (e) {
          console.error('Failed to fetch leaderboard or my records', e);
        }
      };
      fetchLeaderboard();
    }
  }, [mode, token]);

  const getModeLabel = () => {
    switch (mode) {
      case 'MARATHON': return 'MARATHON';
      case '40_LINES': return '40 LINES';
      case '4_WIDE': return '4-WIDE';
      case 'ONLINE_1V1': return 'MULTI PLAY';
      case 'MULTI_PLAY': return 'MULTI PLAY';
      case 'CONFIG': return 'CONFIG';
      default: return 'UNKNOWN MODE';
    }
  };

  const getModeColor = () => {
    switch (mode) {
      case 'MARATHON': return '#4caf50';
      case '40_LINES': return '#ff9800';
      case '4_WIDE': return '#3498db';
      case 'ONLINE_1V1': return '#e74c3c';
      case 'MULTI_PLAY': return '#e74c3c';
      case 'CONFIG': return '#9b59b6';
      default: return '#fff';
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-header">
        <button className="back-btn" onClick={() => navigate('/menu')}>
          ◀ BACK TO MENU
        </button>
        {mode !== 'CONFIG' && (
          token && user ? (
            <div className="user-controls">
              <button 
                className={`nav-btn ${selectedIndex === 1 ? 'selected' : ''}`} 
                onClick={() => navigate(`/dashboard?mode=${mode}`)}
                onMouseEnter={() => setSelectedIndex(1)}
                style={selectedIndex === 1 ? { backgroundColor: '#555' } : {}}
              >
                {selectedIndex === 1 ? '▶ Dashboard' : 'Dashboard'}
              </button>
              <button 
                className={`nav-btn ${selectedIndex === 2 ? 'selected' : ''}`} 
                onClick={() => navigate(`/profile?mode=${mode}`)}
                onMouseEnter={() => setSelectedIndex(2)}
                style={selectedIndex === 2 ? { backgroundColor: '#555' } : {}}
              >
                {selectedIndex === 2 ? '▶ Profile' : 'Profile'}
              </button>
              <button 
                className={`nav-btn ${selectedIndex === 3 ? 'selected' : ''}`} 
                onClick={() => { logout(); navigate('/'); }}
                onMouseEnter={() => setSelectedIndex(3)}
                style={selectedIndex === 3 ? { backgroundColor: '#555' } : {}}
              >
                {selectedIndex === 3 ? '▶ Logout' : 'Logout'}
              </button>
            </div>
          ) : (
            <button 
              className={`nav-btn ${selectedIndex === 1 ? 'selected' : ''}`} 
              onClick={() => navigate(`/login?redirectTo=/lobby/${mode}&cancelTo=/lobby/${mode}`)}
              onMouseEnter={() => setSelectedIndex(1)}
              style={selectedIndex === 1 ? { backgroundColor: '#555' } : {}}
            >
              {selectedIndex === 1 && !isMobile ? '▶ Register / Login' : 'Register / Login'}
            </button>
          )
        )}
      </div>

      <div className="lobby-content">
        <h1 className="mode-title" style={{ color: getModeColor() }}>
          {getModeLabel()}
        </h1>

        {mode === 'MARATHON' && (() => {
          const index = startLevel === 1 ? 0 : startLevel / 5;
          const blocksCount = 4 + index;
          const blockSize = isMobile ? 12 : 20;
          const trackWidth = blockSize * 24;
          return (
            <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px', color: '#ccc' }}>STARTING LEVEL</span>
              
              <div 
                className="marathon-slider-wrapper" 
                style={{ position: 'relative', width: `${trackWidth}px`, height: `${blockSize}px`, marginTop: '5px', touchAction: 'none', cursor: 'pointer' }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  let newIndex = Math.round((x / trackWidth) * 20);
                  if (newIndex < 0) newIndex = 0;
                  if (newIndex > 20) newIndex = 20;
                  setStartLevel(newIndex === 0 ? 1 : newIndex * 5);
                }}
                onPointerMove={(e) => {
                  if (e.buttons > 0) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    let newIndex = Math.round((x / trackWidth) * 20);
                    if (newIndex < 0) newIndex = 0;
                    if (newIndex > 20) newIndex = 20;
                    setStartLevel(newIndex === 0 ? 1 : newIndex * 5);
                  }
                }}
                onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
              >
                {/* The empty background track */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: `${trackWidth}px`, height: `${blockSize}px`, backgroundColor: '#111', border: '2px solid #333', boxSizing: 'border-box', pointerEvents: 'none' }} />
                
                {/* The stretching I-tetromino made of individual blocks */}
                <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, height: `${blockSize}px`, pointerEvents: 'none' }}>
                  {Array.from({ length: blocksCount }).map((_, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        width: `${blockSize}px`, 
                        height: `${blockSize}px`, 
                        backgroundColor: '#00FFFF', // Cyan color like in-game
                        borderTop: `${isMobile ? '2px' : '3px'} solid rgba(255, 255, 255, 0.4)`,
                        borderLeft: `${isMobile ? '2px' : '3px'} solid rgba(255, 255, 255, 0.4)`,
                        borderBottom: `${isMobile ? '2px' : '3px'} solid rgba(0, 0, 0, 0.4)`,
                        borderRight: `${isMobile ? '2px' : '3px'} solid rgba(0, 0, 0, 0.4)`,
                        boxSizing: 'border-box' 
                      }} 
                    />
                  ))}
                </div>
              </div>
              
              <div style={{ fontSize: '24px', color: '#fff', textShadow: '2px 2px 0 #00FFFF', marginTop: '15px' }}>
                {startLevel}
              </div>
              {!isMobile && (
                <span style={{ fontSize: '10px', color: '#888', marginTop: '-5px' }}>USE ← / → KEYS TO STRETCH</span>
              )}
            </div>
          );
        })()}

        {mode === 'MULTI_PLAY' && (
          <div className="multi-play-buttons">
            <div className="multi-play-primary-row">
              <button
                className="start-game-btn"
                onClick={() => handleStartGame(`/play/ONLINE_1V1`)}
                style={{ borderColor: '#e74c3c', boxShadow: `0 0 20px #e74c3c`, marginBottom: 0 }}
              >
                RANDOM MATCH
              </button>
              <button
                className="start-game-btn"
                onClick={() => handleStartGame(`/play/CUSTOM_ROOMS`)}
                style={{ borderColor: '#d35400', boxShadow: `0 0 20px #d35400`, color: '#d35400', marginBottom: 0 }}
              >
                CUSTOM ROOMS
              </button>
            </div>
            <div className="multi-play-ai-buttons">
              <h2 className="multi-play-ai-title">VS AI</h2>
              {AI_DIFFICULTIES.map((difficulty) => {
                const color = AI_DIFFICULTY_COLORS[difficulty];
                return (
                  <button
                    key={difficulty}
                    className="start-game-btn"
                    onClick={() => setSelectedAiDifficulty(difficulty)}
                    style={{
                      borderColor: color,
                      boxShadow: `0 0 20px ${color}`,
                      color,
                      marginBottom: 0,
                    }}
                  >
                    {difficulty}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode !== 'CONFIG' && mode !== 'MULTI_PLAY' && (
          <button 
            className={`start-game-btn ${selectedIndex === 0 && !isMobile ? 'selected' : ''}`} 
            onClick={() => handleStartGame(`/play/${mode}?level=${startLevel}`)}
            onMouseEnter={() => setSelectedIndex(0)}
            style={{ 
              borderColor: getModeColor(), 
              boxShadow: `0 0 20px ${getModeColor()}`,
              marginBottom: '40px',
              ...(selectedIndex === 0 && !isMobile ? { backgroundColor: 'rgba(255,255,255,0.1)', transform: 'scale(1.05)' } : {})
            }}
          >
            {selectedIndex === 0 && !isMobile ? `▶ ${mode === 'ONLINE_1V1' ? 'FIND MATCH' : 'START GAME'}` : (mode === 'ONLINE_1V1' ? 'FIND MATCH' : 'START GAME')}
          </button>
        )}

        <div className="lobby-panels">
          {mode === 'CONFIG' && (
            <div className="panel config-panel">
              <Config
                tuning={tuning}
                setTuning={setTuning}
                volume={volume}
                setVolume={setVolume}
                keyConfig={keyConfig}
                listeningAction={listeningAction}
                setListeningAction={setListeningAction as any}
                setAppState={() => {}}
              />
            </div>
          )}
          
          {mode === '40_LINES' && token && user && (
            <div className="panel records-panel" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, justifyContent: 'flex-start', overflow: 'hidden' }}>
              <div style={{ 
                display: 'flex', 
                gap: '10px', 
                justifyContent: 'center', 
                padding: '15px', 
                backgroundColor: 'rgba(0,0,0,0.5)', 
                borderBottom: '2px solid #444',
                position: 'sticky',
                top: 0,
                zIndex: 10
              }}>
                <button 
                  onClick={() => setRecordTab('MY')}
                  style={{
                    flex: 1,
                    padding: '15px 10px',
                    backgroundColor: recordTab === 'MY' ? '#ff9800' : '#222',
                    border: recordTab === 'MY' ? '2px solid #fff' : '2px solid #555',
                    color: '#fff',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  MY RECORDS
                </button>
                <button 
                  onClick={() => setRecordTab('GLOBAL')}
                  style={{
                    flex: 1,
                    padding: '15px 10px',
                    backgroundColor: recordTab === 'GLOBAL' ? '#ff9800' : '#222',
                    border: recordTab === 'GLOBAL' ? '2px solid #fff' : '2px solid #555',
                    color: '#fff',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  GLOBAL
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', width: '100%', boxSizing: 'border-box' }}>
                <Records 
                  records={recordTab === 'MY' ? myRecords : records} 
                  title={recordTab === 'MY' ? "MY TOP 10" : "GLOBAL TOP 10"} 
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedAiDifficulty && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-speed-title"
          className="ai-speed-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedAiDifficulty(null);
          }}
        >
          <div className="ai-speed-modal">
            <h3 id="ai-speed-title">AI MOVE SPEED</h3>
            <div className="ai-speed-modal-difficulty">
              VS AI (
              <span style={{ color: AI_DIFFICULTY_COLORS[selectedAiDifficulty] }}>
                {selectedAiDifficulty}
              </span>
              )
            </div>
            <fieldset className="ai-speed-selector">
              <legend>SPEED</legend>
              <div className="ai-speed-value">
                <strong>{aiSpeedPercent === 100 ? 'INSTANT' : `${aiSpeedPercent}%`}</strong>
                <span>{aiActionDelayMs} ms / move</span>
              </div>
              <div className="ai-speed-tetromino-slider">
                <div className="ai-speed-slider-track" aria-hidden="true" />
                {Array.from({ length: 4 + aiSpeedPercent / 5 }).map((_, index) => (
                  <div className="ai-speed-slider-block" key={index} aria-hidden="true" />
                ))}
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={aiSpeedPercent}
                  aria-label="AI move speed"
                  onChange={(event) => setAiSpeedPercent(Number(event.target.value))}
                />
              </div>
              <div className="ai-speed-scale" aria-hidden="true">
                <span>SLOW</span>
                <span>INSTANT</span>
              </div>
            </fieldset>
            <div className="ai-speed-modal-actions">
              <button onClick={() => setSelectedAiDifficulty(null)}>CANCEL</button>
              <button
                className="ai-speed-start-btn"
                onClick={() => {
                  const difficulty = selectedAiDifficulty;
                  setSelectedAiDifficulty(null);
                  handleStartGame(
                    `/play/VS_AI?difficulty=${difficulty}&aiSpeedMs=${aiActionDelayMs}`,
                  );
                }}
              >
                START
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileConfig && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#111', padding: '25px', borderRadius: '0px', border: '4px solid #fff',
            color: 'white', width: '85%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px',
            boxShadow: '8px 8px 0px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ margin: 0, textAlign: 'center', color: '#00FFFF', fontSize: '18px', fontFamily: '"Press Start 2P", monospace', textShadow: '2px 2px 0 #000', lineHeight: '1.4' }}>CONTROLS</h3>
            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '12px', padding: '15px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #444', paddingBottom: '6px' }}><span style={{ color: '#aaa' }}>Swipe L/R</span><span style={{ fontWeight: 'bold' }}>Move</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #444', paddingBottom: '6px' }}><span style={{ color: '#aaa' }}>Swipe Down</span><span style={{ fontWeight: 'bold' }}>Soft Drop</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #444', paddingBottom: '6px' }}><span style={{ color: '#aaa' }}>Flick Down</span><span style={{ fontWeight: 'bold', color: '#ff4444' }}>Hard Drop</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #444', paddingBottom: '6px' }}><span style={{ color: '#aaa' }}>Tap L/R Half</span><span style={{ fontWeight: 'bold', color: '#4caf50' }}>Rotate L/R</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #444', paddingBottom: '6px' }}><span style={{ color: '#aaa' }}>Flick Up</span><span style={{ fontWeight: 'bold', color: '#f1c40f' }}>Rotate 180</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#aaa' }}>Tap HOLD Btn</span><span style={{ fontWeight: 'bold', color: '#9b59b6' }}>Hold Piece</span></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', gap: '15px' }}>
              <button 
                onClick={() => setShowMobileConfig(false)}
                style={{ 
                  fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', 
                  color: '#fff', border: '4px solid #555', cursor: 'pointer', flex: 1, 
                  fontSize: '12px', transition: 'transform 0.1s', boxShadow: '4px 4px 0px rgba(85,85,85,0.5)' 
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
              >
                CANCEL
              </button>
              <button 
                onClick={() => navigate(targetPlayPath)}
                style={{ 
                  fontFamily: '"Press Start 2P", monospace', padding: '15px', backgroundColor: '#000', 
                  color: '#fff', border: '4px solid #4caf50', cursor: 'pointer', flex: 1, 
                  fontSize: '12px', transition: 'transform 0.1s', boxShadow: '4px 4px 0px rgba(76,175,80,0.5)' 
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
              >
                START
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
