import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundTetris } from '../components/BackgroundTetris';
import { TETROMINOS } from '../utils/tetrominos';
import { useAuth } from '../hooks/useAuth';
import './JoinPage.css';

export default function JoinPage() {
  const [loading, setLoading] = useState(false);
  const [loadingPiece, setLoadingPiece] = useState<any>(null);
  const [selectedIndex, setSelectedIndex] = useState(0); // 0: GUEST, 1: LOGIN
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS') {
        setSelectedIndex(prev => (prev === 0 ? 1 : 0));
      } else if (e.code === 'Enter' || e.code === 'Space') {
        if (selectedIndex === 0) {
          handleGuest();
        } else {
          navigate('/login?cancelTo=/');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, selectedIndex, navigate]);

  const handleGuest = () => {
    if (loading) return;
    
    // Ensure the user is logged out when choosing to play as guest
    logout();
    
    // Pick a random piece and an independent random color
    const keys = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    const colors = ['cyan', 'blue', 'orange', 'yellow', 'green', 'purple', 'red'];
    const randomKey = keys[Math.floor(Math.random() * keys.length)] as keyof typeof TETROMINOS;
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    setLoadingPiece({
      shape: TETROMINOS[randomKey as 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z'].shape,
      color: randomColor
    });
    
    setLoading(true);
    // 1秒間ロード演出を見せてからTOP画面（ゲーム）へ遷移
    setTimeout(() => {
      navigate('/menu');
    }, 1000);
  };

  // キーボード操作などが不要になったためEnterキーリスナーを削除

  return (
    <div className="join-page-container">
      {!loading && (
        <>
          <div className="background-tetris left">
            <BackgroundTetris reversed />
          </div>
          <div className="background-tetris right">
            <BackgroundTetris />
          </div>
        </>
      )}

      {!loading ? (
        <div className="join-content" style={{ fontFamily: "'Press Start 2P', monospace" }}>
          <h1 className="title-text" style={{ textShadow: '4px 4px 0px #000' }}>TETRIS</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px', width: '360px' }}>
            <button 
              className={`join-button ${selectedIndex === 0 ? 'selected' : ''}`}
              onMouseEnter={() => setSelectedIndex(0)}
              onClick={handleGuest} 
            >
              {selectedIndex === 0 ? '▶ PLAY AS GUEST' : 'PLAY AS GUEST'}
            </button>
            <button 
              className={`join-button ${selectedIndex === 1 ? 'selected' : ''}`}
              onMouseEnter={() => setSelectedIndex(1)}
              onClick={() => navigate('/login?cancelTo=/')} 
            >
              {selectedIndex === 1 ? '▶ LOGIN / REGISTER' : 'LOGIN / REGISTER'}
            </button>
          </div>
        </div>
      ) : (
        <div className="loading-content">
          <div 
            className="tetris-spinner" 
            style={{ 
              width: loadingPiece ? loadingPiece.shape[0].length * 20 : 60,
              height: loadingPiece ? loadingPiece.shape.length * 20 : 60
            }}
          >
            {loadingPiece && loadingPiece.shape.map((row: any[], y: number) =>
              row.map((cell: string | number, x: number) => {
                if (cell !== 0) {
                  return (
                    <div
                      key={`${y}-${x}`}
                      style={{
                        position: 'absolute',
                        width: '20px',
                        height: '20px',
                        backgroundColor: loadingPiece.color,
                        boxShadow: 'inset 0 0 0 2px #111',
                        top: `${y * 20}px`,
                        left: `${x * 20}px`
                      }}
                    />
                  );
                }
                return null;
              })
            )}
          </div>
          <div className="loading-text">LOADING...</div>
        </div>
      )}
    </div>
  );
}
