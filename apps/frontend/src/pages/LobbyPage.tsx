import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Config } from '../components/UI/Config';
import { Records } from '../components/UI/Records';
import { useAuth } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import './LobbyPage.css';

export default function LobbyPage() {
  const { mode } = useParams<{ mode: string }>();
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();
  
  const [startLevel, setStartLevel] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(0); // 0: START GAME, 1: ACTION (Register/Login or Dashboard)
  const { tuning, setTuning, keyConfig, listeningAction, setListeningAction, volume, setVolume } = useConfig();

  useEffect(() => {
    if (mode === 'ONLINE_1V1' || mode === 'CUSTOM_ROOMS') {
      navigate('/lobby/MULTI_PLAY', { replace: true });
    }
  }, [mode, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (listeningAction) return;

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
  }, [mode, startLevel, navigate, keyConfig.quitToMenu, listeningAction, selectedIndex, token, user]);

  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    if (mode === '40_LINES') {
      const fetchLeaderboard = async () => {
        try {
          const res = await fetch(`/api/sprint/leaderboard`);
          if (res.ok) {
            const data = await res.json();
            setRecords(data);
          }
        } catch (e) {
          console.error('Failed to fetch leaderboard', e);
        }
      };
      fetchLeaderboard();
    }
  }, [mode]);

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
              {selectedIndex === 1 ? '▶ Register / Login' : 'Register / Login'}
            </button>
          )
        )}
      </div>

      <div className="lobby-content">
        <h1 className="mode-title" style={{ color: getModeColor() }}>
          {getModeLabel()}
        </h1>

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
            <div className="panel records-panel">
              <Records records={records} />
            </div>
          )}
        </div>

        {mode === 'MARATHON' && (() => {
          const index = startLevel === 1 ? 0 : startLevel / 5;
          const blocksCount = 4 + index;
          return (
            <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px', color: '#ccc' }}>STARTING LEVEL</span>
              
              <div style={{ position: 'relative', width: '480px', height: '20px', marginTop: '5px' }}>
                {/* The empty background track */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: '480px', height: '20px', backgroundColor: '#111', border: '2px solid #333', boxSizing: 'border-box' }} />
                
                {/* The stretching I-tetromino made of individual blocks */}
                <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, height: '20px', pointerEvents: 'none' }}>
                  {Array.from({ length: blocksCount }).map((_, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        backgroundColor: '#00FFFF', // Cyan color like in-game
                        borderTop: '3px solid rgba(255, 255, 255, 0.4)',
                        borderLeft: '3px solid rgba(255, 255, 255, 0.4)',
                        borderBottom: '3px solid rgba(0, 0, 0, 0.4)',
                        borderRight: '3px solid rgba(0, 0, 0, 0.4)',
                        boxSizing: 'border-box' 
                      }} 
                    />
                  ))}
                </div>

                {/* Hidden actual range input for mouse interaction */}
                <input 
                  type="range"
                  min="0" max="20"
                  value={index}
                  onChange={e => {
                    const idx = Number(e.target.value);
                    setStartLevel(idx === 0 ? 1 : idx * 5);
                  }}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '480px', height: '20px',
                    opacity: 0, cursor: 'pointer', margin: 0
                  }}
                />
              </div>
              
              <div style={{ fontSize: '24px', color: '#fff', textShadow: '2px 2px 0 #00FFFF', marginTop: '15px' }}>
                {startLevel}
              </div>
              <span style={{ fontSize: '10px', color: '#888', marginTop: '-5px' }}>USE ← / → KEYS TO STRETCH</span>
            </div>
          );
        })()}

        {mode === 'MULTI_PLAY' && (
          <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
            <button 
              className="start-game-btn" 
              onClick={() => navigate(`/play/ONLINE_1V1`)}
              style={{ borderColor: '#e74c3c', boxShadow: `0 0 20px #e74c3c` }}
            >
              RANDOM MATCH
            </button>
            <button 
              className="start-game-btn" 
              onClick={() => navigate(`/play/CUSTOM_ROOMS`)}
              style={{ borderColor: '#d35400', boxShadow: `0 0 20px #d35400`, color: '#d35400' }}
            >
              CUSTOM ROOMS
            </button>
          </div>
        )}

        {mode !== 'CONFIG' && mode !== 'MULTI_PLAY' && (
          <button 
            className={`start-game-btn ${selectedIndex === 0 ? 'selected' : ''}`} 
            onClick={() => navigate(`/play/${mode}?level=${startLevel}`)}
            onMouseEnter={() => setSelectedIndex(0)}
            style={{ 
              borderColor: getModeColor(), 
              boxShadow: `0 0 20px ${getModeColor()}`,
              ...(selectedIndex === 0 ? { backgroundColor: 'rgba(255,255,255,0.1)', transform: 'scale(1.05)' } : {})
            }}
          >
            {selectedIndex === 0 ? `▶ ${mode === 'ONLINE_1V1' ? 'FIND MATCH' : 'START GAME'}` : (mode === 'ONLINE_1V1' ? 'FIND MATCH' : 'START GAME')}
          </button>
        )}
      </div>
    </div>
  );
}
