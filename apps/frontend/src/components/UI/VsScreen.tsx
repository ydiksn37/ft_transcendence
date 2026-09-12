import React, { useEffect, useState } from 'react';
import '../../pages/LobbyPage.css'; // Leverage existing retro styles

type VsScreenProps = {
  opponents: Record<string, { username?: string | null; displayName?: string }>;
  mySocketId: string | null;
  myUsername: string | null;
};

export const VsScreen: React.FC<VsScreenProps> = ({ opponents, mySocketId, myUsername }) => {
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    // Optional: add some flashing effect just before transition
    const t = setTimeout(() => setShowFlash(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const opponentKeys = Object.keys(opponents);
  let player1Name = myUsername || 'PLAYER 1';
  let player2Name = 'PLAYER 2';

  if (opponentKeys.length === 2 && mySocketId && !opponentKeys.includes(mySocketId)) {
    // Spectating
    player1Name = opponents[opponentKeys[0]]?.displayName || opponents[opponentKeys[0]]?.username || 'PLAYER 1';
    player2Name = opponents[opponentKeys[1]]?.displayName || opponents[opponentKeys[1]]?.username || 'PLAYER 2';
  } else if (opponentKeys.length > 0) {
    // Playing
    player2Name = opponents[opponentKeys[0]]?.displayName || opponents[opponentKeys[0]]?.username || 'PLAYER 2';
  }

  return (
    <div className="lobby-container" style={{ 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: showFlash ? '#eee' : '#111',
      transition: 'background-color 0.2s',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '40px', flexWrap: 'wrap' }}>
        
        {/* Player 1 */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          animation: 'slideInLeft 0.5s ease-out' 
        }}>
          <div style={{ 
            width: '100px', 
            height: '100px', 
            backgroundColor: '#3498db', 
            border: '4px solid #fff',
            marginBottom: '20px',
            boxShadow: '4px 4px 0 #000'
          }} />
          <h2 style={{ color: '#fff', fontSize: '24px', textShadow: '2px 2px 0 #000' }}>
            {player1Name.toUpperCase()}
          </h2>
        </div>

        {/* VS text */}
        <div style={{ 
          animation: 'pulse 1s infinite alternate',
          transform: 'scale(1.5)',
          color: '#e74c3c',
          fontSize: '48px',
          fontWeight: 'bold',
          textShadow: '4px 4px 0 #000'
        }}>
          VS
        </div>

        {/* Player 2 */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          animation: 'slideInRight 0.5s ease-out' 
        }}>
          <div style={{ 
            width: '100px', 
            height: '100px', 
            backgroundColor: '#e74c3c', 
            border: '4px solid #fff',
            marginBottom: '20px',
            boxShadow: '4px 4px 0 #000'
          }} />
          <h2 style={{ color: '#fff', fontSize: '24px', textShadow: '2px 2px 0 #000' }}>
            {player2Name.toUpperCase()}
          </h2>
        </div>

      </div>

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100vw); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100vw); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes pulse {
          from { transform: scale(1.2); }
          to { transform: scale(1.5); text-shadow: 4px 4px 0 #000, 0 0 20px #e74c3c; }
        }
      `}</style>
    </div>
  );
};
