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
  const { tuning, setTuning, keyConfig, listeningAction, setListeningAction } = useConfig();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (listeningAction) return;

      if (e.code === keyConfig.quitToMenu) {
        navigate('/menu');
        return;
      }
      if (e.code === 'Enter' && mode !== 'CONFIG') {
        navigate(`/play/${mode}?level=${startLevel}`);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, startLevel, navigate, keyConfig.quitToMenu, listeningAction]);

  // Load records directly here just for viewing
  const records = JSON.parse(localStorage.getItem('tetris40LinesRecords') || '[]');

  const getModeLabel = () => {
    switch (mode) {
      case 'MARATHON': return 'MARATHON';
      case '40_LINES': return '40 LINES';
      case '4_WIDE': return '4-WIDE';
      case 'ONLINE_1V1': return 'ONLINE 1v1';
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
        {token && user ? (
          <div className="user-controls">
            <button className="nav-btn" onClick={() => navigate('/dashboard')}>Dashboard</button>
            <button className="nav-btn" onClick={() => { logout(); navigate('/'); }}>Logout</button>
          </div>
        ) : (
          <button className="nav-btn" onClick={() => navigate(`/login?redirectTo=/lobby/${mode}`)}>Register / Login</button>
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

        {mode === 'MARATHON' && (
          <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '16px', color: '#ccc' }}>STARTING LEVEL: {startLevel}</span>
            <input 
              type="range" 
              min="1" 
              max="99" 
              value={startLevel} 
              onChange={e => setStartLevel(Number(e.target.value))}
              style={{ width: '200px', cursor: 'pointer' }}
            />
          </div>
        )}

        {mode !== 'CONFIG' && (
          <button 
            className="start-game-btn" 
            onClick={() => navigate(`/play/${mode}?level=${startLevel}`)}
            style={{ borderColor: getModeColor(), boxShadow: `0 0 20px ${getModeColor()}` }}
          >
            {mode === 'ONLINE_1V1' ? 'FIND MATCH' : 'START GAME'}
          </button>
        )}
      </div>
    </div>
  );
}
