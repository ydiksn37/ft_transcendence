import './Progression.css';

export type ProgressionData = {
  xp: number; level: number; levelProgress: number; levelTarget: number;
  rank: string; rankPoints: number;
  achievements: Array<{ key: string; name: string; description: string; target: number;
    group?: string; groupName?: string; tier?: number; totalTiers?: number;
    progress: number; xpReward: number; earnedAt: string | null }>;
};

export function ProgressionSummary({ data }: { data: ProgressionData }) {
  return <section aria-label="Level and rank" className="profile-progression">
    <div className="progression-overview">
      <div className="progression-level"><span>LEVEL</span><strong>{data.level}</strong></div>
      <div className="progression-xp">
        <div><span>{data.levelProgress} / {data.levelTarget} XP</span><span>{data.xp} XP TOTAL</span></div>
        <progress aria-label="XP toward next level" value={data.levelProgress} max={data.levelTarget} />
      </div>
      <div className="progression-rank"><strong>{data.rank}</strong><span>{data.rankPoints} RP</span></div>
    </div>
  </section>;
}

export function AchievementProgression({ data }: { data: ProgressionData }) {
  const unlocked = data.achievements.filter(item => item.earnedAt).length;
  const groups = new Map<string, ProgressionData['achievements']>();
  for (const item of data.achievements) {
    const key = item.group ?? item.key;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return <section aria-label="Achievements" className="profile-progression progression-achievements-page">
    <div className="achievements-page-heading">
      <h2>ACHIEVEMENTS</h2>
      <span className="achievement-count">{unlocked} / {data.achievements.length} UNLOCKED</span>
    </div>
    <div className="achievement-list">
      {[...groups.entries()].map(([key, unsortedTiers]) => {
        const tiers = [...unsortedTiers].sort((a, b) => a.target - b.target);
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
  </section>;
}
