import React from 'react';

type ConfigProps = {
  tuning: { arr: number; das: number; dcd: number; sdf: number };
  setTuning: React.Dispatch<React.SetStateAction<{ arr: number; das: number; dcd: number; sdf: number }>>;
  keyConfig: Record<string, string>;
  listeningAction: string | null;
  setListeningAction: (action: string | null) => void;
  setAppState: (state: 'MENU') => void;
};

export const Config: React.FC<ConfigProps> = ({ tuning, setTuning, keyConfig, listeningAction, setListeningAction,}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '40px' }}>
      <h1>Configuration</h1>
      
      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#333', borderRadius: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '600px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'gray' }}>ARR (ms)</label>
          <input type="number" min="0" value={tuning.arr} onChange={e => setTuning(p => ({...p, arr: Number(e.target.value)}))} style={{ width: '60px', padding: '4px', textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'gray' }}>DAS (ms)</label>
          <input type="number" min="0" value={tuning.das} onChange={e => setTuning(p => ({...p, das: Number(e.target.value)}))} style={{ width: '60px', padding: '4px', textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'gray' }}>DCD (ms)</label>
          <input type="number" min="0" value={tuning.dcd} onChange={e => setTuning(p => ({...p, dcd: Number(e.target.value)}))} style={{ width: '60px', padding: '4px', textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'gray' }}>SDF (0=Inf)</label>
          <input type="number" min="0" value={tuning.sdf} onChange={e => setTuning(p => ({...p, sdf: Number(e.target.value)}))} style={{ width: '60px', padding: '4px', textAlign: 'center' }} />
        </div>
      </div>

      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#333', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', maxWidth: '600px' }}>
        <h4 style={{ margin: 0, color: '#ccc' }}>Key Configuration</h4>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {Object.entries(keyConfig).map(([action, code]) => (
            <div key={action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', color: 'gray', textTransform: 'capitalize' }}>{action.replace(/([A-Z])/g, ' $1').trim()}</label>
              <button
                onClick={() => {
                  setListeningAction(action);
                  window.focus();
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: listeningAction === action ? '#ff4444' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  minWidth: '60px'
                }}
              >
                {listeningAction === action ? 'Press key...' : code.replace(/^Key/, '').replace(/(Left|Right|Up|Down)$/, (match, p1) => {
                  if (code.startsWith('Arrow')) return p1;
                  return match;
                }).replace(/^Arrow/, '')}
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
