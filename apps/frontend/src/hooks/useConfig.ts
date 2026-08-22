import { useState, useEffect, useRef } from 'react';

export const useConfig = () => {
  const [tuning, setTuning] = useState(() => {
    const defaultTuning = { das: 133, arr: 33, dcd: 1, sdf: 6, touchFlick: true };
    const saved = localStorage.getItem('tetrisTuning');
    if (saved) {
      try { return { ...defaultTuning, ...JSON.parse(saved) }; } catch (e) {}
    }
    return defaultTuning;
  });
  const tuningRef = useRef(tuning);

  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tetrisVolume');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { se: 0.5, bgm: 0.5 };
  });
  const volumeRef = useRef(volume);

  const [keyConfig, setKeyConfig] = useState(() => {
    const defaultConf = {
      left: 'KeyA', right: 'KeyD', softDrop: 'KeyS', hardDrop: 'KeyW',
      rotateCW: 'Slash', rotateCCW: 'Comma', rotate180: 'Period',
      hold: 'ShiftLeft', restart: 'KeyQ', quitToMenu: 'Escape'
    };
    const saved = localStorage.getItem('tetrisKeyConfig');
    if (saved) {
      try { return { ...defaultConf, ...JSON.parse(saved) }; } catch (e) {}
    }
    return defaultConf;
  });
  const keyConfigRef = useRef(keyConfig);

  const [listeningAction, setListeningAction] = useState<string | null>(null);
  const listeningActionRef = useRef(listeningAction);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch initial settings from DB
  useEffect(() => {
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
        
        if (localTuning || localVolume || localKeyConfig) {
          // Push guest settings to the DB
          await fetch('/api/users/me/settings', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              das: tuningRef.current.das,
              arr: tuningRef.current.arr,
              dcd: tuningRef.current.dcd,
              sdf: tuningRef.current.sdf,
              touchFlick: tuningRef.current.touchFlick,
              keyBindings: keyConfigRef.current,
              volume: Math.max(volumeRef.current.se, volumeRef.current.bgm) * 100,
              sfxEnabled: volumeRef.current.se > 0,
              musicEnabled: volumeRef.current.bgm > 0
            })
          });

          // Cleanup localStorage
          localStorage.removeItem('tetrisTuning');
          localStorage.removeItem('tetrisVolume');
          localStorage.removeItem('tetrisKeyConfig');
        }
        // ---------------------------------

        const res = await fetch('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const user = await res.json();
          if (user.gameSettings) {
            const gs = user.gameSettings;
            if (gs.keyBindings) setKeyConfig(gs.keyBindings);
            setTuning({ das: gs.das, arr: gs.arr, dcd: gs.dcd, sdf: gs.sdf, touchFlick: gs.touchFlick ?? true });
            setVolume({ se: gs.sfxEnabled ? gs.volume / 100 : 0, bgm: gs.musicEnabled ? gs.volume / 100 : 0 });
          }
        }
      } catch (err) {
        console.error("Failed to load settings from DB", err);
      } finally {
        setIsInitialized(true);
      }
    };
    fetchSettings();
  }, []);

  // Save changes
  useEffect(() => {
    if (!isInitialized) return;

    const token = localStorage.getItem('token');

    if (!token) {
      localStorage.setItem('tetrisTuning', JSON.stringify(tuning));
      localStorage.setItem('tetrisVolume', JSON.stringify(volume));
      localStorage.setItem('tetrisKeyConfig', JSON.stringify(keyConfig));
    }

    tuningRef.current = tuning;
    volumeRef.current = volume;
    keyConfigRef.current = keyConfig;

    const saveToDB = async () => {
      if (!token) return;
      try {
        await fetch('/api/users/me/settings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            das: tuning.das,
            arr: tuning.arr,
            dcd: tuning.dcd,
            sdf: tuning.sdf,
            touchFlick: tuning.touchFlick,
            keyBindings: keyConfig,
            volume: Math.max(volume.se, volume.bgm) * 100,
            sfxEnabled: volume.se > 0,
            musicEnabled: volume.bgm > 0
          })
        });
      } catch (err) {
        console.error("Failed to save settings to DB", err);
      }
    };
    saveToDB();
  }, [tuning, volume, keyConfig, isInitialized]);

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
    tuning, setTuning, tuningRef,
    keyConfig, setKeyConfig, keyConfigRef,
    listeningAction, setListeningAction, listeningActionRef,
    volume, setVolume, volumeRef
  };
};
