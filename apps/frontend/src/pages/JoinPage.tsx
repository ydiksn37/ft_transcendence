import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundTetris } from '../components/BackgroundTetris';
import { TETROMINOS } from '../utils/tetrominos';
import { useAuth } from '../hooks/useAuth';
import './JoinPage.css';

export default function JoinPage() {
  const [loading, setLoading] = useState(false);
  const [loadingPiece, setLoadingPiece] = useState<any>(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

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
    // 2.5秒間ロード演出を見せてからTOP画面（ゲーム）へ遷移
    setTimeout(() => {
      navigate('/menu');
    }, 2500);
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px', width: '300px' }}>
            <button 
              className="join-button" 
              onClick={handleGuest} 
              style={{ fontSize: '16px', padding: '15px', animation: 'none' }}
            >
              PLAY AS GUEST
            </button>
            <button 
              className="join-button" 
              onClick={() => navigate('/login')} 
              style={{ fontSize: '16px', padding: '15px', animation: 'none' }}
            >
              LOGIN / REGISTER
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
