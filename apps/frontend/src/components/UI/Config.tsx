import React, { useEffect } from 'react';
import { soundManager } from '../../utils/soundManager';
import { MinoSkinPicker } from './MinoSkinPicker';
import type { useConfig } from '../../hooks/useConfig';
import { DisplayPreview } from './DisplayPreview';
import './Config.css';

const tabs = ['CONTROLS', 'DISPLAY', 'SOUND'] as const;
const keyConfigRows = [
  ['left', 'right', 'softDrop', 'hardDrop'],
  ['rotateCW', 'rotateCCW', 'rotate180'],
  ['hold', 'restart', 'quitToMenu'],
] as const;

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
  const [tab, setTab] = React.useState<typeof tabs[number]>(() => 'CONTROLS');
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
    <div className="config-root">
      <h1 className="config-title">CONFIGURATION</h1>
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
      <section className="config-section" aria-labelledby="display-settings-heading">
        <h2 id="display-settings-heading" style={{ fontSize: '16px', marginTop: 0 }}>GAME DISPLAY</h2>
        <div className="config-display-layout"><div>
        <label className="config-checkbox">
          <input type="checkbox" checked={showGhost} onChange={event => setShowGhost(event.target.checked)} />
          <span className="config-checkbox-mark" aria-hidden="true" />
          <span>SHOW GHOST PIECE</span>
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
      <div className="config-section config-number-grid">
        <div className="config-control">
          <label htmlFor="config-arr">ARR (ms)</label>
          <input id="config-arr" className="config-number-input" type="number" min="0" max="5000" value={tuning.arr} onChange={e => setTuning(p => ({...p, arr: Math.max(0, Math.min(5000, Number(e.target.value) || 0))}))} />
        </div>
        <div className="config-control">
          <label htmlFor="config-das">DAS (ms)</label>
          <input id="config-das" className="config-number-input" type="number" min="0" max="5000" value={tuning.das} onChange={e => setTuning(p => ({...p, das: Math.max(0, Math.min(5000, Number(e.target.value) || 0))}))} />
        </div>
        <div className="config-control">
          <label htmlFor="config-dcd">DCD (ms)</label>
          <input id="config-dcd" className="config-number-input" type="number" min="0" max="5000" value={tuning.dcd} onChange={e => setTuning(p => ({...p, dcd: Math.max(0, Math.min(5000, Number(e.target.value) || 0))}))} />
        </div>
        <div className="config-control">
          <label htmlFor="config-sdf">SDF (0=Inf)</label>
          <input id="config-sdf" className="config-number-input" type="number" min="0" max="1000" value={tuning.sdf} onChange={e => setTuning(p => ({...p, sdf: Math.max(0, Math.min(1000, Number(e.target.value) || 0))}))} />
        </div>
      </div>
      </>}

      {tab === 'SOUND' &&
      <div className="config-section config-sound-grid">
        <div className="config-slider-control">
          <label htmlFor="config-se-volume">SE VOLUME: {Math.round(volume.se * 100)}%</label>
          <input 
            id="config-se-volume" className="config-range"
            type="range" min="0" max="1" step="0.05" value={volume.se} 
            onChange={e => {
              const val = Number(e.target.value);
              setVolume(p => ({...p, se: val}));
              soundManager.setVolumes(val, volume.bgm);
              soundManager.playSe('test');
            }}
          />
        </div>
        <div className="config-slider-control">
          <label htmlFor="config-bgm-volume">BGM VOLUME: {Math.round(volume.bgm * 100)}%</label>
          <input 
            id="config-bgm-volume" className="config-range"
            type="range" min="0" max="1" step="0.05" value={volume.bgm} 
            onChange={e => {
              const val = Number(e.target.value);
              setVolume(p => ({...p, bgm: val}));
              soundManager.setVolumes(volume.se, val);
            }}
          />
        </div>
      </div>
      }

      {tab === 'CONTROLS' && !isMobile && (
        <div className="config-section config-key-panel">
          <h4>KEY CONFIGURATION</h4>
          <div className="config-key-grid">
            {keyConfigRows.map((row, rowIndex) => (
              <div className={`config-key-row${rowIndex === 0 ? ' is-movement-row' : ''}`} key={rowIndex}>
              {row.map((action) => {
              const code = keyConfig[action] || '';
              return (
              <div className="config-key-control" key={action}>
                <span>{action.replace(/([A-Z])/g, ' $1').trim()}</span>
                <button
                  className={`config-key-button${listeningAction === action ? ' is-listening' : ''}`}
                  onClick={() => {
                    setListeningAction(action);
                    window.focus();
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
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
