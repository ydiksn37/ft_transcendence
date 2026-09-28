import type { Prisma } from '@prisma/client';

type Metric =
  | 'wins'
  | 'totalGames'
  | 'totalLinesCleared'
  | 'bestWinStreak'
  | 'totalTSpins'
  | 'totalTetrises'
  | 'totalISpins'
  | 'totalJSpins'
  | 'totalLSpins'
  | 'totalSSpins'
  | 'totalZSpins';
type Progress = Partial<Record<Metric, number>>;

// A single catalogue drives both award conditions and the progression API/UI.
const milestones = [1, 10, 20, 50, 100, 200, 1000];
const series: Array<{
  group: string;
  name: string;
  metric: Metric;
  targets: number[];
  verb: string;
}> = [
  {
    group: 'wins',
    name: 'Victories',
    metric: 'wins',
    targets: milestones,
    verb: 'Win matches',
  },
  {
    group: 'games',
    name: 'Games played',
    metric: 'totalGames',
    targets: milestones,
    verb: 'Complete games',
  },
  {
    group: 'lines',
    name: 'Line clears',
    metric: 'totalLinesCleared',
    targets: [100, 500, 1000, 5000, 10000, 50000, 100000],
    verb: 'Clear lines',
  },
  {
    group: 'streak',
    name: 'Win streak',
    metric: 'bestWinStreak',
    targets: [3, 5, 10, 20, 50],
    verb: 'Win consecutive matches',
  },
  {
    group: 'tetrises',
    name: 'Tetrises',
    metric: 'totalTetrises',
    targets: milestones,
    verb: 'Clear Tetrises',
  },
  ...(['T', 'I', 'J', 'L', 'S', 'Z'] as const).map((piece) => ({
    group: `${piece.toLowerCase()}_spins`,
    name: `${piece}-Spins`,
    metric: `total${piece}Spins` as Metric,
    targets: milestones,
    verb: `Perform line-clearing ${piece}-Spins`,
  })),
];
// Keep old keys/rewards: existing unlocks must never pay XP twice.
const legacy: Record<string, { key: string; xp: number }> = {
  wins_1: { key: 'first_win', xp: 100 },
  wins_10: { key: 'ten_wins', xp: 200 },
  games_100: { key: 'hundred_games', xp: 200 },
  t_spins_10: { key: 'spin_specialist', xp: 150 },
  tetrises_100: { key: 'tetris_master', xp: 300 },
};
export const GAME_ACHIEVEMENTS = series.flatMap((series) =>
  series.targets.map((target, index) => {
    const key = `${series.group}_${target}`;
    return {
      key: legacy[key]?.key ?? key,
      group: series.group,
      groupName: series.name,
      tier: index + 1,
      totalTiers: series.targets.length,
      name: `${series.name} ${index + 1}`,
      description: `${series.verb}: ${target}.`,
      metric: series.metric,
      target,
      xpReward: legacy[key]?.xp ?? [50, 100, 150, 250, 400, 600, 1000][index],
    };
  }),
);

/** Must run inside the same serializable transaction as the stats update. */
export async function awardGameAchievements(
  tx: Prisma.TransactionClient,
  userId: string,
  progress: Progress,
): Promise<number> {
  const eligible = GAME_ACHIEVEMENTS.filter(
    (item) => (progress[item.metric] ?? 0) >= item.target,
  );
  if (!eligible.length) return 0;
  const existing = await tx.userAchievement.findMany({
    where: {
      userId,
      achievement: { key: { in: eligible.map((item) => item.key) } },
    },
    select: { achievement: { select: { key: true } } },
  });
  const owned = new Set(existing.map((item) => item.achievement.key));
  let reward = 0;
  for (const item of eligible) {
    if (owned.has(item.key)) continue;
    const { key, name, description, xpReward } = item;
    const achievement = await tx.achievement.upsert({
      where: { key },
      update: {},
      create: { key, name, description, xpReward, category: 'GAME' },
    });
    // The unique user/achievement constraint is the final duplicate-award guard.
    const inserted = await tx.userAchievement.createMany({
      data: [{ userId, achievementId: achievement.id }],
      skipDuplicates: true,
    });
    if (inserted.count === 1) reward += achievement.xpReward;
  }
  return reward;
}
