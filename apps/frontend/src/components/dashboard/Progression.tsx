import { useEffect, useState } from 'react';

type ProgressionData = {
  xp: number; level: number; levelProgress: number; levelTarget: number;
  rank: string; rankPoints: number;
  achievements: Array<{ key: string; name: string; description: string; target: number;
    progress: number; xpReward: number; earnedAt: string | null }>;
};

export function Progression() {
  const [data, setData] = useState<ProgressionData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    const token = localStorage.getItem('token');
    if (!token) { setError(true); return; }
    fetch('/api/users/me/progression', {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Progression unavailable');
      const body: ProgressionData = await response.json();
      if (!controller.signal.aborted) setData(body);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);

  return <section aria-label="Achievements and progression" style={{ marginTop: 24 }}>
    <h2>ACHIEVEMENTS &amp; PROGRESSION</h2>
    {error ? <p role="alert">Could not load progression. <button onClick={() => setAttempt(value => value + 1)}>RETRY</button></p>
      : !data ? <p role="status">Loading progression…</p> : <>
        <p>LEVEL {data.level} · {data.xp} XP · {data.rank} · {data.rankPoints} RP</p>
        <progress aria-label="XP toward next level" value={data.levelProgress} max={data.levelTarget} />
        <span> {data.levelProgress} / {data.levelTarget} XP to next level</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 16 }}>
          {data.achievements.map(item => <article key={item.key} style={{ border: '1px solid var(--border, #444)', padding: 16 }}>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <progress aria-label={item.name} value={item.progress} max={item.target} />
            <p>{item.progress} / {item.target} · +{item.xpReward} XP</p>
            <p>{item.earnedAt ? `UNLOCKED · ${new Date(item.earnedAt).toLocaleDateString()}` : 'LOCKED'}</p>
          </article>)}
        </div>
      </>}
  </section>;
}
