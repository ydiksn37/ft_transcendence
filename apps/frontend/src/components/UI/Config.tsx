import React, { useEffect } from 'react';
import { soundManager } from '../../utils/soundManager';
import { MinoSkinPicker } from './MinoSkinPicker';
import type { useConfig } from '../../hooks/useConfig';
import { DisplayPreview } from './DisplayPreview';
import './Config.css';

const tabs = ['DISPLAY', 'CONTROLS', 'SOUND'] as const;

type ConfigProps = Pick<ReturnType<typeof useConfig>,
  'showGhost' | 'setShowGhost' | 'displayTheme' | 'setDisplayTheme' |
  'mapStyle' | 'setMapStyle' | 'backgroundStyle' | 'setBackgroundStyle'> & {
  minoSkin: 'NEON' | 'RETRO' | 'MINIMAL';
  setMinoSkin: (skin: 'NEON' | 'RETRO' | 'MINIMAL') => void;
  tuning: { arr: number; das: number; dcd: number; sdf: number; touchFlick?: boolean };
  setTuning: React.Dispatch<React.SetStateAction<{ arr: number; das: number; dcd: number; sdf: number; touchFlick?: boolean }>>;
  volume: { se: number; bgm: number };
  setVolume: React.Dispatch<React.SetStateAction<{ se: number; bgm: number }>>;
  keyConfig: Record<string, string>;
  listeningAction: string | null;
  setListeningAction: (action: string | null) => void;
  setAppState: (state: 'MENU') => void;
};

export const Config: React.FC<ConfigProps> = ({ minoSkin, setMinoSkin, showGhost, setShowGhost, displayTheme, setDisplayTheme, mapStyle, setMapStyle, backgroundStyle, setBackgroundStyle, tuning, setTuning, volume, setVolume, keyConfig, listeningAction, setListeningAction }) => {
  const [tab, setTab] = React.useState<typeof tabs[number]>(() => 'DISPLAY');
  const selectTab = (next: typeof tab) => {
    setListeningAction(null);
    setTab(next);
  };
  useEffect(() => {
    soundManager.setVolumes(volume.se, volume.bgm);
  }, [volume]);
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '10px', width: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '24px' }}>Configuration</h1>
      <div className="config-tabs" role="tablist" aria-label="Configuration categories">
        {tabs.map((name, index) => <button key={name} type="button" role="tab"
          id={`config-tab-${name}`} aria-controls={`config-panel-${name}`}
          aria-selected={tab === name} tabIndex={tab === name ? 0 : -1}
          onClick={() => selectTab(name)}
          onKeyDown={event => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault();
            event.stopPropagation();
            selectTab(tabs[next]);
            document.getElementById(`config-tab-${tabs[next]}`)?.focus();
          }}>{name}</button>)}
      </div>
      <div className="config-tab-panel" role="tabpanel" id={`config-panel-${tab}`} aria-labelledby={`config-tab-${tab}`} tabIndex={0}>
      {tab === 'DISPLAY' && <>
      <MinoSkinPicker value={minoSkin} onChange={setMinoSkin} />
      <section aria-labelledby="display-settings-heading" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#333', borderRadius: '8px', width: '100%', maxWidth: '600px', boxSizing: 'border-box' }}>
        <h2 id="display-settings-heading" style={{ fontSize: '16px', marginTop: 0 }}>GAME DISPLAY</h2>
        <div className="config-display-layout"><div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0', fontSize: '12px' }}>
          <input type="checkbox" checked={showGhost} onChange={event => setShowGhost(event.target.checked)} style={{ accentColor: '#00ffff' }} />
          SHOW GHOST PIECE
        </label>
        <label className="retro-select-label">THEME
          <select className="retro-select" value={displayTheme} onChange={event => setDisplayTheme(event.target.value as typeof displayTheme)}>
            <option value="CYBER">CYBER</option><option value="ARCADE">ARCADE</option><option value="MONO">MONO</option>
          </select>
        </label>
        <label className="retro-select-label">MAP
          <select className="retro-select" value={mapStyle} onChange={event => setMapStyle(event.target.value as typeof mapStyle)}>
            <option value="GRID">GRID</option><option value="VOID">VOID</option><option value="ARENA">ARENA</option>
          </select>
        </label>
        <label className="retro-select-label">BACKGROUND
          <select className="retro-select" value={backgroundStyle} onChange={event => setBackgroundStyle(event.target.value as typeof backgroundStyle)}>
            <option value="MATRIX">MATRIX</option><option value="STARS">STARS</option><option value="SOLID">SOLID</option>
          </select>
        </label>
        </div><DisplayPreview minoSkin={minoSkin} showGhost={showGhost} displayTheme={displayTheme} mapStyle={mapStyle} backgroundStyle={backgroundStyle} /></div>
        <p style={{ fontSize: '10px', lineHeight: 1.8 }}>These visual customizations affect your display only. They do not alter game rules, mechanics, or your opponent's view.</p>
      </section>
      </>}
      
      {tab === 'CONTROLS' && <>
      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#333', borderRadius: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '600px', boxSizing: 'border-box' }}>
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
      </>}

      {tab === 'SOUND' &&
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#333', borderRadius: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '600px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 200px' }}>
          <label style={{ fontSize: '12px', color: 'gray', marginBottom: '10px' }}>SE Volume: {Math.round(volume.se * 100)}%</label>
          <input 
            type="range" min="0" max="1" step="0.05" value={volume.se} 
            onChange={e => {
              const val = Number(e.target.value);
              setVolume(p => ({...p, se: val}));
              soundManager.setVolumes(val, volume.bgm);
              soundManager.playSe('test');
            }} 
            style={{ width: '100%' }} 
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 200px' }}>
          <label style={{ fontSize: '12px', color: 'gray', marginBottom: '10px' }}>BGM Volume: {Math.round(volume.bgm * 100)}%</label>
          <input 
            type="range" min="0" max="1" step="0.05" value={volume.bgm} 
            onChange={e => {
              const val = Number(e.target.value);
              setVolume(p => ({...p, bgm: val}));
              soundManager.setVolumes(volume.se, val);
            }} 
            style={{ width: '100%' }} 
          />
        </div>
      </div>
      }

      {tab === 'CONTROLS' && !isMobile && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#333', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', width: '100%', maxWidth: '600px', boxSizing: 'border-box' }}>
          <h4 style={{ margin: 0, color: '#ccc' }}>Key Configuration</h4>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              'left', 'right', 'softDrop', 'hardDrop',
              'rotateCW', 'rotateCCW', 'rotate180',
              'hold', 'restart', 'quitToMenu'
            ].map((action) => {
              const code = keyConfig[action] || '';
              return (
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
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
