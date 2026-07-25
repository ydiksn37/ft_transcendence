import React from 'react';

type MenuProps = {
  startGame: (mode: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1') => void;
  joinOnline: () => void;
  setAppState: (state: 'CONFIG' | 'RECORDS') => void;
};

export const Menu: React.FC<MenuProps> = ({ startGame, joinOnline, setAppState }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1 style={{ fontSize: '48px', marginBottom: '40px', color: '#ff4444' }}>PixiJS Tetris</h1>
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
