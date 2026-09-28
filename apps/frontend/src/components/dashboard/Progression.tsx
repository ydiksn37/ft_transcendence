import { useEffect, useState } from 'react';
import './Progression.css';

type ProgressionData = {
  xp: number; level: number; levelProgress: number; levelTarget: number;
  rank: string; rankPoints: number;
  achievements: Array<{ key: string; name: string; description: string; target: number;
    group?: string; groupName?: string; tier?: number; totalTiers?: number;
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

  const unlocked = data?.achievements.filter(item => item.earnedAt).length ?? 0;
  const groups = new Map<string, ProgressionData['achievements']>();
  for (const item of data?.achievements ?? []) {
    const key = item.group ?? item.key;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return <section aria-label="Achievements and progression" className="profile-progression">
    {error ? <p role="alert">Could not load progression. <button onClick={() => setAttempt(value => value + 1)}>RETRY</button></p>
      : !data ? <p role="status">Loading progression…</p> : <>
        <div className="progression-overview">
          <div className="progression-level"><span>LEVEL</span><strong>{data.level}</strong></div>
          <div className="progression-xp">
            <div><span>{data.levelProgress} / {data.levelTarget} XP</span><span>{data.xp} XP TOTAL</span></div>
            <progress aria-label="XP toward next level" value={data.levelProgress} max={data.levelTarget} />
          </div>
          <div className="progression-rank"><strong>{data.rank}</strong><span>{data.rankPoints} RP</span></div>
        </div>
        <details className="progression-achievements" onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation(); }}>
          <summary><span>ACHIEVEMENTS</span><span className="achievement-count">{unlocked} / {data.achievements.length} UNLOCKED</span></summary>
          <div className="achievement-list">
            {[...groups.entries()].map(([key, tiers]) => {
              tiers.sort((a, b) => a.target - b.target);
              const item = tiers.find(tier => !tier.earnedAt) ?? tiers[tiers.length - 1];
              const completed = tiers.filter(tier => tier.earnedAt).length;
              return <article key={key} className={`achievement-row${completed === tiers.length ? ' is-earned' : ''}`}>
              <div className="achievement-heading"><h3>{item.groupName ?? item.name}</h3><span>{completed} / {tiers.length}</span></div>
              <p className="achievement-description">{item.description}</p>
              <div className="achievement-progress">
                <progress aria-label={`${item.groupName ?? item.name}: next milestone`} value={item.progress} max={item.target} />
                <span>{item.progress} / {item.target}</span>
              </div>
              <span className="achievement-status">{completed === tiers.length ? 'ALL TIERS UNLOCKED' : `NEXT: ${item.target} · +${item.xpReward} XP`}</span>
              <details className="achievement-tiers">
                <summary>ALL MILESTONES</summary>
                <ol>{tiers.map(tier => <li key={tier.key} className={tier.earnedAt ? 'is-earned' : ''}>
                  <span>{tier.target.toLocaleString()}</span><span>+{tier.xpReward} XP</span>
                  <span>{tier.earnedAt ? `UNLOCKED · ${new Date(tier.earnedAt).toLocaleDateString()}` : 'LOCKED'}</span>
                </li>)}</ol>
              </details>
            </article>;
            })}
          </div>
        </details>
      </>}
  </section>;
}
