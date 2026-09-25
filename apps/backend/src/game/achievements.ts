import type { Prisma } from '@prisma/client';

type Progress = {
  wins: number;
  totalGames: number;
  totalTSpins: number;
  totalTetrises: number;
};

// A single catalogue drives both award conditions and the progression API/UI.
export const GAME_ACHIEVEMENTS = [
  {
    key: 'first_win',
    name: 'First victory',
    description: 'Win your first match.',
    metric: 'wins',
    target: 1,
    xpReward: 100,
  },
  {
    key: 'ten_wins',
    name: 'Ten victories',
    description: 'Win 10 matches.',
    metric: 'wins',
    target: 10,
    xpReward: 200,
  },
  {
    key: 'hundred_games',
    name: 'Regular player',
    description: 'Complete 100 games.',
    metric: 'totalGames',
    target: 100,
    xpReward: 200,
  },
  {
    key: 'spin_specialist',
    name: 'Spin specialist',
    description: 'Perform 10 T-spins.',
    metric: 'totalTSpins',
    target: 10,
    xpReward: 150,
  },
  {
    key: 'tetris_master',
    name: 'Tetris master',
    description: 'Clear 100 Tetrises.',
    metric: 'totalTetrises',
    target: 100,
    xpReward: 300,
  },
] as const satisfies ReadonlyArray<{
  key: string;
  name: string;
  description: string;
  metric: keyof Progress;
  target: number;
  xpReward: number;
}>;

/** Must run inside the same serializable transaction as the stats update. */
export async function awardGameAchievements(
  tx: Prisma.TransactionClient,
  userId: string,
  progress: Progress,
): Promise<number> {
  const eligible = GAME_ACHIEVEMENTS.filter(
    (item) => progress[item.metric] >= item.target,
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
