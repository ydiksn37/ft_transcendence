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
        padding: '5px 10px',
        border: '1px solid #444',
        borderRadius: '4px',
        margin: '5px',
        backgroundColor: '#222',
        minWidth: '100px',
        textAlign: 'center'
      }}>
        {node.playerIds.length > 0 ? getPlayerName(node.playerIds[0]) : 'TBD'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {node.children.map((child) => (
          <div key={child.id} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
            <TournamentBracket node={child} getPlayerName={getPlayerName} />
            {/* simple line connector */}
            <div style={{ width: '20px', height: '1px', backgroundColor: '#666' }} />
          </div>
        ))}
      </div>
      <div style={{
        padding: '10px',
        border: `2px solid ${isActive ? '#e74c3c' : '#444'}`,
        borderRadius: '4px',
        margin: '5px',
        backgroundColor: isActive ? '#4a1111' : '#222',
        minWidth: '100px',
        textAlign: 'center'
      }}>
        {node.winnerId ? `Winner: ${getPlayerName(node.winnerId)}` : 'Match'}
      </div>
    </div>
  );
};
