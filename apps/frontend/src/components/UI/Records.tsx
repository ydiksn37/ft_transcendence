import React from 'react';

type RecordsProps = {
  records: any[];
  title?: string;
};

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

export const Records: React.FC<RecordsProps> = ({ records, title = "40 LINES TOP 10" }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <h2 style={{ margin: '0 0 20px 0', color: '#ff9800', textShadow: '2px 2px 0 #000', textAlign: 'center' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontSize: '14px', width: '100%', maxWidth: '500px' }}>
        {records.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#888' }}>No records yet.</p>
        ) : (
          records.map((r, idx) => (
            <div key={idx} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              color: idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : 'white',
              borderBottom: '2px dashed #444',
              paddingBottom: '8px'
            }}>
              <span style={{ width: '30px' }}>{idx + 1}.</span>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '10px' }}>
                {r.user?.displayName || r.user?.username || r.record?.user?.displayName || r.record?.user?.username || 'Guest'}
              </span>
              <span style={{ minWidth: '80px', textAlign: 'right' }}>{formatTime(r.record?.timeMs || r)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
