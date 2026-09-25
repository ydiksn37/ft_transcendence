import { useState, useEffect, useRef } from 'react';

const DEFAULT_KEYS = {
  left: 'KeyA', right: 'KeyD', softDrop: 'KeyS', hardDrop: 'KeyW',
  rotateCW: 'Slash', rotateCCW: 'Comma', rotate180: 'Period',
  hold: 'ShiftLeft', restart: 'KeyQ', quitToMenu: 'Escape',
};

type DisplayTheme = 'CYBER' | 'ARCADE' | 'MONO';
type MapStyle = 'GRID' | 'VOID' | 'ARENA';
type BackgroundStyle = 'MATRIX' | 'STARS' | 'SOLID';

export const useConfig = () => {
  const [minoSkin, setMinoSkin] = useState<'NEON' | 'RETRO' | 'MINIMAL'>(() => {
    const saved = localStorage.getItem('tetrisMinoSkin');
    return saved === 'RETRO' || saved === 'MINIMAL' ? saved : 'NEON';
  });
  const [showGhost, setShowGhost] = useState(() => localStorage.getItem('tetrisShowGhost') !== 'false');
  const [displayTheme, setDisplayTheme] = useState<DisplayTheme>(() => {
    const saved = localStorage.getItem('tetrisDisplayTheme');
    return saved === 'ARCADE' || saved === 'MONO' ? saved : 'CYBER';
  });
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => {
    const saved = localStorage.getItem('tetrisMapStyle');
    return saved === 'VOID' || saved === 'ARENA' ? saved : 'GRID';
  });
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>(() => {
    const saved = localStorage.getItem('tetrisBackgroundStyle');
    return saved === 'STARS' || saved === 'SOLID' ? saved : 'MATRIX';
  });
  const [tuning, setTuning] = useState(() => {
    const defaultTuning = { das: 133, arr: 33, dcd: 1, sdf: 6, touchFlick: true };
    const saved = localStorage.getItem('tetrisTuning');
    if (saved) {
      try { return { ...defaultTuning, ...JSON.parse(saved) }; } catch { /* Invalid saved data: use defaults. */ }
    }
    return defaultTuning;
  });
  const tuningRef = useRef(tuning);

  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tetrisVolume');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* Invalid saved data: use defaults. */ }
    }
    return { se: 0.5, bgm: 0.5 };
  });
  const volumeRef = useRef(volume);

  const [keyConfig, setKeyConfig] = useState(() => {
    const defaultConf = DEFAULT_KEYS;
    const saved = localStorage.getItem('tetrisKeyConfig');
    if (saved) {
      try { return { ...defaultConf, ...JSON.parse(saved) }; } catch { /* Invalid saved data: use defaults. */ }
    }
    return defaultConf;
  });
  const keyConfigRef = useRef(keyConfig);

  const [listeningAction, setListeningAction] = useState<string | null>(null);
  const listeningActionRef = useRef(listeningAction);
  const [isInitialized, setIsInitialized] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const isFirstRenderAfterInit = useRef(true);

  // Fetch initial settings from DB
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setIsInitialized(false);
    isFirstRenderAfterInit.current = true;
    setSettingsError(null);
    const fetchSettings = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsInitialized(true);
        return;
      }
      
      try {
        // --- Migration & Cleanup Logic ---
        const localTuning = localStorage.getItem('tetrisTuning');
        const localVolume = localStorage.getItem('tetrisVolume');
        const localKeyConfig = localStorage.getItem('tetrisKeyConfig');
        const localShowGhost = localStorage.getItem('tetrisShowGhost');
        const localMinoSkin = localStorage.getItem('tetrisMinoSkin');
        const localDisplayTheme = localStorage.getItem('tetrisDisplayTheme');
        const localMapStyle = localStorage.getItem('tetrisMapStyle');
        const localBackgroundStyle = localStorage.getItem('tetrisBackgroundStyle');
        
        if (localTuning || localVolume || localKeyConfig || localShowGhost !== null || localMinoSkin !== null || localDisplayTheme !== null || localMapStyle !== null || localBackgroundStyle !== null) {
          const payload: any = {};
          if (localShowGhost !== null) payload.showGhost = localShowGhost !== 'false';
          if (localMinoSkin !== null) payload.minoSkin = ['NEON', 'RETRO', 'MINIMAL'].includes(localMinoSkin) ? localMinoSkin : 'NEON';
          if (localDisplayTheme !== null) payload.displayTheme = ['CYBER', 'ARCADE', 'MONO'].includes(localDisplayTheme) ? localDisplayTheme : 'CYBER';
          if (localMapStyle !== null) payload.mapStyle = ['GRID', 'VOID', 'ARENA'].includes(localMapStyle) ? localMapStyle : 'GRID';
          if (localBackgroundStyle !== null) payload.backgroundStyle = ['MATRIX', 'STARS', 'SOLID'].includes(localBackgroundStyle) ? localBackgroundStyle : 'MATRIX';
          if (localTuning) {
            payload.das = tuningRef.current.das;
            payload.arr = tuningRef.current.arr;
            payload.dcd = tuningRef.current.dcd;
            payload.sdf = tuningRef.current.sdf;
            payload.touchFlick = tuningRef.current.touchFlick;
          }
          if (localKeyConfig) {
            payload.keyBindings = keyConfigRef.current;
          }
          if (localVolume) {
            payload.volume = Math.round(Math.max(volumeRef.current.se, volumeRef.current.bgm) * 100);
            payload.sfxEnabled = volumeRef.current.se > 0;
            payload.musicEnabled = volumeRef.current.bgm > 0;
          }

          // Push guest settings to the DB
          const migration = await fetch('/api/users/me/settings', {
            signal,
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });
          if (!migration.ok) throw new Error('Failed to migrate local settings');
          if (signal.aborted) return;

          // Cleanup localStorage
          localStorage.removeItem('tetrisTuning');
          localStorage.removeItem('tetrisVolume');
          localStorage.removeItem('tetrisKeyConfig');
          localStorage.removeItem('tetrisShowGhost');
          localStorage.removeItem('tetrisMinoSkin');
          localStorage.removeItem('tetrisDisplayTheme');
          localStorage.removeItem('tetrisMapStyle');
          localStorage.removeItem('tetrisBackgroundStyle');
        }
        // ---------------------------------

        const res = await fetch('/api/users/me', {
          signal,
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load settings');
        {
          const user = await res.json();
          if (signal.aborted) return;
          if (user.gameSettings) {
            const gs = user.gameSettings;
            setShowGhost(gs.showGhost ?? true);
            setMinoSkin(gs.minoSkin === 'RETRO' || gs.minoSkin === 'MINIMAL' ? gs.minoSkin : 'NEON');
            setDisplayTheme(gs.displayTheme === 'ARCADE' || gs.displayTheme === 'MONO' ? gs.displayTheme : 'CYBER');
            setMapStyle(gs.mapStyle === 'VOID' || gs.mapStyle === 'ARENA' ? gs.mapStyle : 'GRID');
            setBackgroundStyle(gs.backgroundStyle === 'STARS' || gs.backgroundStyle === 'SOLID' ? gs.backgroundStyle : 'MATRIX');
            setKeyConfig({ ...DEFAULT_KEYS, ...(gs.keyBindings ?? {}) });
            setTuning({ das: gs.das, arr: gs.arr, dcd: gs.dcd, sdf: gs.sdf, touchFlick: gs.touchFlick ?? true });
            setVolume({ se: gs.sfxEnabled ? gs.volume / 100 : 0, bgm: gs.musicEnabled ? gs.volume / 100 : 0 });
          }
        }
        setIsInitialized(true);
      } catch {
        if (!signal.aborted) setSettingsError('設定を取得できません。DBへの自動保存を停止しています。再読み込みしてください。');
      }
    };
    fetchSettings();
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    tuningRef.current = tuning;
    volumeRef.current = volume;
    keyConfigRef.current = keyConfig;
  }, [tuning, volume, keyConfig]);

  // Save changes
  useEffect(() => {
    if (!isInitialized) return;
    
    if (isFirstRenderAfterInit.current) {
      isFirstRenderAfterInit.current = false;
      // Update refs to DB values before returning
      tuningRef.current = tuning;
      volumeRef.current = volume;
      keyConfigRef.current = keyConfig;
      return;
    }

    const token = localStorage.getItem('token');

    if (!token) {
      localStorage.setItem('tetrisShowGhost', String(showGhost));
      localStorage.setItem('tetrisMinoSkin', minoSkin);
      localStorage.setItem('tetrisDisplayTheme', displayTheme);
      localStorage.setItem('tetrisMapStyle', mapStyle);
      localStorage.setItem('tetrisBackgroundStyle', backgroundStyle);
      localStorage.setItem('tetrisTuning', JSON.stringify(tuning));
      localStorage.setItem('tetrisVolume', JSON.stringify(volume));
      localStorage.setItem('tetrisKeyConfig', JSON.stringify(keyConfig));
    }

    tuningRef.current = tuning;
    volumeRef.current = volume;
    keyConfigRef.current = keyConfig;

    const timeoutId = setTimeout(async () => {
      if (!token || localStorage.getItem('token') !== token) return;
      try {
        const res = await fetch('/api/users/me/settings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            showGhost,
            minoSkin,
            displayTheme,
            mapStyle,
            backgroundStyle,
            das: tuning.das,
            arr: tuning.arr,
            dcd: tuning.dcd,
            sdf: tuning.sdf,
            touchFlick: tuning.touchFlick,
            keyBindings: keyConfig,
            volume: Math.round(Math.max(volume.se, volume.bgm) * 100),
            sfxEnabled: volume.se > 0,
            musicEnabled: volume.bgm > 0
          })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("Save config failed:", errData);
          setSettingsError(`設定の保存に失敗しました: ${errData.message || res.status}`);
        } else setSettingsError(null);
      } catch {
        setSettingsError('設定を保存できません。通信を確認してください。');
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [tuning, volume, keyConfig, showGhost, minoSkin, displayTheme, mapStyle, backgroundStyle, isInitialized]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.displayTheme = displayTheme.toLowerCase();
    document.documentElement.dataset.backgroundStyle = backgroundStyle.toLowerCase();
  }, [displayTheme, backgroundStyle]);

  useEffect(() => { listeningActionRef.current = listeningAction; }, [listeningAction]);

  useEffect(() => {
    if (!listeningAction) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const code = e.code;
      setKeyConfig((prev: Record<string, string>) => ({ ...prev, [listeningAction]: code }));
      setListeningAction(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningAction]);

  return {
    settingsError, reloadSettings: () => setLoadAttempt(value => value + 1),
    showGhost, setShowGhost,
    minoSkin, setMinoSkin,
    displayTheme, setDisplayTheme,
    mapStyle, setMapStyle,
    backgroundStyle, setBackgroundStyle,
    tuning, setTuning, tuningRef,
    keyConfig, setKeyConfig, keyConfigRef,
    listeningAction, setListeningAction, listeningActionRef,
    volume, setVolume, volumeRef
  };
};
