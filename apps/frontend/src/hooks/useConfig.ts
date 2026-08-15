import { useState, useEffect, useRef } from 'react';

export const useConfig = () => {
  const [tuning, setTuning] = useState(() => {
    const saved = localStorage.getItem('tetrisTuning');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { das: 133, arr: 33, dcd: 1, sdf: 6 };
  });
  const tuningRef = useRef(tuning);
  useEffect(() => {
    localStorage.setItem('tetrisTuning', JSON.stringify(tuning));
    tuningRef.current = tuning;
  }, [tuning]);

  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tetrisVolume');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { se: 0.5, bgm: 0.5 };
  });
  const volumeRef = useRef(volume);
  useEffect(() => {
    localStorage.setItem('tetrisVolume', JSON.stringify(volume));
    volumeRef.current = volume;
  }, [volume]);

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
  useEffect(() => {
    localStorage.setItem('tetrisKeyConfig', JSON.stringify(keyConfig));
    keyConfigRef.current = keyConfig;
  }, [keyConfig]);

  const [listeningAction, setListeningAction] = useState<string | null>(null);
  const listeningActionRef = useRef(listeningAction);
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
