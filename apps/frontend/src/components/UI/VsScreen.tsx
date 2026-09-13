import React, { useEffect, useState } from 'react';
import '../../pages/LobbyPage.css'; // Leverage existing retro styles

type VsScreenProps = {
  opponents: Record<string, { username?: string | null; displayName?: string }>;
  mySocketId: string | null;
  myUsername: string | null;
  isSpectating: boolean;
};

export const VsScreen: React.FC<VsScreenProps> = ({ opponents, mySocketId, myUsername, isSpectating }) => {
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    // Optional: add some flashing effect just before transition
    const t = setTimeout(() => setShowFlash(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const opponentKeys = Object.keys(opponents);
  
  const allPlayers: { id: string; name: string; color: string }[] = [];
  const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e'];

  // 自分がプレイヤーとして参加している場合
  if (!isSpectating && mySocketId) {
    allPlayers.push({
      id: mySocketId,
      name: myUsername || 'PLAYER 1',
      color: colors[0]
    });
  }

  // 他のプレイヤー（または観戦時の全プレイヤー）を追加
  opponentKeys.forEach((key) => {
    const opp = opponents[key];
    const name = opp?.displayName || opp?.username || `PLAYER ${allPlayers.length + 1}`;
    allPlayers.push({
      id: key,
      name: name,
      color: colors[allPlayers.length % colors.length]
    });
  });

  const isMultiplayer = allPlayers.length > 2;

  return (
    <div className="lobby-container" style={{ 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: showFlash ? '#eee' : '#111',
      transition: 'background-color 0.2s',
      zIndex: 100,
      flexDirection: 'column'
    }}>
      {isMultiplayer ? (
        /* --- BATTLE ROYALE (3人以上) --- */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '40px' }}>
          <div style={{
            animation: 'pulse 1s infinite alternate',
            color: '#f1c40f',
            fontSize: '48px',
            fontWeight: 'bold',
            textShadow: '4px 4px 0 #000'
          }}>
            BATTLE ROYALE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px', flexWrap: 'wrap', maxWidth: '80%' }}>
            {allPlayers.map((p, index) => (
              <div key={p.id} style={{ 
                display: 'flex', flexDirection: 'column', alignItems: 'center', 
                animation: `slideInUp 0.5s ease-out ${index * 0.1}s backwards` 
              }}>
                <div style={{ width: '80px', height: '80px', backgroundColor: p.color, border: '4px solid #fff', marginBottom: '15px', boxShadow: '4px 4px 0 #000' }} />
                <h2 style={{ color: '#fff', fontSize: '16px', textShadow: '2px 2px 0 #000' }}>{p.name.toUpperCase()}</h2>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* --- 1 VS 1 (2人) --- */
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
              backgroundColor: allPlayers[0]?.color || '#3498db', 
              border: '4px solid #fff',
              marginBottom: '20px',
              boxShadow: '4px 4px 0 #000'
            }} />
            <h2 style={{ color: '#fff', fontSize: '24px', textShadow: '2px 2px 0 #000' }}>
              {(allPlayers[0]?.name || 'PLAYER 1').toUpperCase()}
            </h2>
          </div>

          {/* VS text */}
          <div style={{ 
            animation: 'pulseVS 1s infinite alternate',
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
              backgroundColor: allPlayers[1]?.color || '#e74c3c', 
              border: '4px solid #fff',
              marginBottom: '20px',
              boxShadow: '4px 4px 0 #000'
            }} />
            <h2 style={{ color: '#fff', fontSize: '24px', textShadow: '2px 2px 0 #000' }}>
              {(allPlayers[1]?.name || 'PLAYER 2').toUpperCase()}
            </h2>
          </div>

        </div>
      )}

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100vw); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100vw); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInUp {
          from { transform: translateY(50px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulseVS {
          from { transform: scale(1.2); }
          to { transform: scale(1.5); text-shadow: 4px 4px 0 #000, 0 0 20px #e74c3c; }
        }
        @keyframes pulse {
          from { transform: scale(1.1); }
          to { transform: scale(1.3); text-shadow: 4px 4px 0 #000, 0 0 20px rgba(255,255,255,0.5); }
        }
      `}</style>
    </div>
  );
};
