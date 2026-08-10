import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './JoinPage.css';

export default function JoinPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoin = () => {
    if (loading) return;
    setLoading(true);
    // 2.5秒間ロード演出を見せてからTOP画面（ゲーム）へ遷移
    setTimeout(() => {
      navigate('/menu');
    }, 2500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleJoin();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading]);

  return (
    <div className="join-page-container">
      {!loading ? (
        <div className="join-content" style={{ fontFamily: "'Press Start 2P', monospace" }}>
          <h1 className="title-text" style={{ textShadow: '4px 4px 0px #000' }}>TETRIS</h1>
          <button className="join-button" onClick={handleJoin} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
           <h2 style={{ color: 'white', fontSize: '24px', letterSpacing: '2px', textShadow: '2px 2px 0px #333', backgroundColor: 'rgba(0,0,0,0.8)', padding: '15px 30px', border: '4px solid white', animation: 'blink 1.5s infinite' }}>PRESS START</h2>
          </button>
        </div>
      ) : (
        <div className="loading-content">
          <div className="tetris-spinner">
            <div className="t-block t-1"></div>
            <div className="t-block t-2"></div>
            <div className="t-block t-3"></div>
            <div className="t-block t-4"></div>
          </div>
          <div className="loading-text">LOADING...</div>
        </div>
      )}
    </div>
  );
}
