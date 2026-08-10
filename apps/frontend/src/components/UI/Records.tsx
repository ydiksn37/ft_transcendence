import React from 'react';

type RecordsProps = {
  records: number[];
};

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

export const Records: React.FC<RecordsProps> = ({ records }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '40px' }}>
      <h1>40 Lines Top 10</h1>
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '20px', minWidth: '300px', backgroundColor: '#222', padding: '20px', borderRadius: '8px' }}>
        {records.length === 0 ? <p style={{ textAlign: 'center' }}>No records yet.</p> : records.map((time, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? '#cd7f32' : 'white' }}>
            <span>{idx + 1}.</span>
            <span>{formatTime(time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
