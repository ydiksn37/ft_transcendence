import React from 'react';
import type { TournamentNode } from '../../types/tournament';

type BracketProps = {
  node: TournamentNode;
  getPlayerName: (id: string) => string;
};

export const TournamentBracket: React.FC<BracketProps> = ({ node, getPlayerName }) => {
  const isLeaf = node.type === 'LEAF';
  const isActive = node.isPlaying;

  if (isLeaf) {
    return (
      <div style={{
        padding: '12px 20px',
        border: '2px solid #444',
        borderRadius: '8px',
        margin: '10px',
        backgroundColor: '#222',
        minWidth: '160px',
        textAlign: 'center',
        fontSize: '14px',
        color: '#fff'
      }}>
        {node.playerIds.length > 0 ? getPlayerName(node.playerIds[0]) : 'TBD'}
      </div>
    );
  }

  const centerIndex = (node.children.length - 1) / 2;
  const winnerIndex = node.winnerId ? node.children.findIndex(c => (c.type === 'LEAF' ? c.playerIds[0] : c.winnerId) === node.winnerId) : -1;
  const minPath = Math.min(winnerIndex, centerIndex);
  const maxPath = Math.max(winnerIndex, centerIndex);

  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateRows: `repeat(${node.children.length}, 1fr)`,
        alignItems: 'stretch'
      }}>
        {node.children.map((child, index) => {
          const isTop = index === 0;
          const isBottom = index === node.children.length - 1;
          const isOnlyChild = node.children.length === 1;

          const isHorizontalYellow = winnerIndex === index;
          const isTopHalfYellow = winnerIndex !== -1 && (index - 0.25) >= minPath && (index - 0.25) <= maxPath;
          const isBottomHalfYellow = winnerIndex !== -1 && (index + 0.25) >= minPath && (index + 0.25) <= maxPath;

          return (
            <div key={child.id} style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <TournamentBracket node={child} getPlayerName={getPlayerName} />
              </div>
              
              <div style={{ flex: 1, minWidth: '20px', position: 'relative' }}>
                {/* Horizontal line from child to the vertical line */}
                <div style={{ 
                  position: 'absolute', 
                  top: '50%', 
                  left: 0, 
                  width: '100%', 
                  height: isHorizontalYellow ? '4px' : '2px', 
                  backgroundColor: isHorizontalYellow ? '#f1c40f' : '#666',
                  transform: 'translateY(-50%)'
                }} />
                
                {/* Vertical line connecting to the middle */}
                {!isOnlyChild && (
                  <>
                    {/* Top half of vertical line */}
                    {!isTop && (
                      <div style={{
                        position: 'absolute',
                        right: 0,
                        width: isTopHalfYellow ? '4px' : '2px',
                        backgroundColor: isTopHalfYellow ? '#f1c40f' : '#666',
                        top: 0,
                        bottom: '50%',
                      }} />
                    )}
                    {/* Bottom half of vertical line */}
                    {!isBottom && (
                      <div style={{
                        position: 'absolute',
                        right: 0,
                        width: isBottomHalfYellow ? '4px' : '2px',
                        backgroundColor: isBottomHalfYellow ? '#f1c40f' : '#666',
                        top: '50%',
                        bottom: 0,
                      }} />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {node.children.length > 0 && (
        <div style={{ width: '20px', display: 'flex', alignItems: 'center', position: 'relative' }}>
          <div style={{ 
            position: 'absolute',
            left: 0,
            width: '100%', 
            height: node.winnerId ? '4px' : '2px', 
            backgroundColor: node.winnerId ? '#f1c40f' : '#666',
            top: '50%',
            transform: 'translateY(-50%)'
          }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{
          padding: '12px 20px',
          border: `3px solid ${isActive ? '#e74c3c' : '#444'}`,
          borderRadius: '8px',
          margin: '10px',
          backgroundColor: isActive ? '#4a1111' : '#222',
          minWidth: '160px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: (isActive || node.winnerId) ? 'bold' : 'normal',
          boxShadow: isActive ? '0 0 15px rgba(231,76,60,0.5)' : 'none',
          color: node.winnerId ? '#f1c40f' : '#fff'
        }}>
          {node.winnerId ? getPlayerName(node.winnerId) : 'TBD'}
        </div>
      </div>
    </div>
  );
};
