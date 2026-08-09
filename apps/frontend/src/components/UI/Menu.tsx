import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

type MenuProps = {
  startGame: (mode: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1') => void;
  joinOnline: () => void;
  openCustomRooms: () => void;
  setAppState: (state: 'CONFIG' | 'RECORDS' | 'CUSTOM_ROOMS') => void;
};

export const Menu: React.FC<MenuProps> = ({ startGame, joinOnline, openCustomRooms, setAppState }) => {
  const navigate = useNavigate();
  const { token, logout, user } = useAuth();

  const handleAuthAction = () => {
    if (token) {
      logout();
    } else {
      navigate('/login');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1 style={{ fontSize: '48px', marginBottom: '40px', color: '#ff4444' }}>PixiJS Tetris</h1>
      
      {user && (
        <p style={{ marginBottom: '20px', fontSize: '18px', color: '#fff' }}>
          Welcome, {user.displayName || user.username}!
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <button
          onClick={() => startGame('MARATHON')}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px' }}
        >
          Marathon Mode
        </button>
        <button
          onClick={() => startGame('40_LINES')}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: '8px' }}
        >
          40 Lines Mode
        </button>
        <button
          onClick={() => startGame('4_WIDE')}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '8px' }}
        >
          4-Wide Mode
        </button>
        <button
          onClick={joinOnline}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px' }}
        >
          Online 1v1 (Random)
        </button>
        <button
          onClick={openCustomRooms}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#d35400', color: '#fff', border: 'none', borderRadius: '8px' }}
        >
          Custom Rooms
        </button>
        <button
          onClick={() => setAppState('RECORDS')}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#9b59b6', color: '#fff', border: 'none', borderRadius: '8px' }}
        >
          Records
        </button>
        <button
          onClick={() => setAppState('CONFIG')}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '8px' }}
        >
          Config
        </button>
        <button
          onClick={handleAuthAction}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: token ? '#e53935' : '#1e88e5', color: '#fff', border: 'none', borderRadius: '8px', marginTop: '20px' }}
        >
          {token ? 'Logout' : 'Login'}
        </button>
      </div>
    </div>
  );
};
