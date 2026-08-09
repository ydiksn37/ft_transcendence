import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

type MenuProps = {
  startGame: (mode: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1') => void;
  joinOnline: () => void;
  setAppState: (state: 'CONFIG' | 'RECORDS') => void;
};

export const Menu: React.FC<MenuProps> = ({ startGame, joinOnline, setAppState }) => {
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1 style={{ fontSize: '48px', marginBottom: '40px', color: '#ff4444' }}>PixiJS Tetris</h1>
      
      {user && (
        <div style={{ marginBottom: '20px', color: '#aaa' }}>
          Welcome back, {user.username}!
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {!token ? (
          <button
            onClick={() => navigate('/login')}
            style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#e91e63', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
          >
            Log In / Register
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{ flex: 1, padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#00bcd4', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              style={{ padding: '15px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
            >
              Log Out
            </button>
          </div>
        )}

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
          Online 1v1
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
      </div>
    </div>
  );
};
