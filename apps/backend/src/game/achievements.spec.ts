import type { Prisma } from '@prisma/client';
import { awardGameAchievements, GAME_ACHIEVEMENTS } from './achievements';

describe('game achievements', () => {
  it('defines unique tiered goals and preserves existing award identities', () => {
    expect(GAME_ACHIEVEMENTS).toHaveLength(75);
    expect(new Set(GAME_ACHIEVEMENTS.map((a) => a.key)).size).toBe(75);
    expect(
      GAME_ACHIEVEMENTS.filter((a) => a.group === 'wins').map((a) => a.target),
    ).toEqual([1, 10, 20, 50, 100, 200, 1000]);
    for (const piece of ['t', 'i', 'j', 'l', 's', 'z']) {
      expect(
        GAME_ACHIEVEMENTS.filter((a) => a.group === `${piece}_spins`),
      ).toHaveLength(7);
    }
    expect(GAME_ACHIEVEMENTS.find((a) => a.key === 'first_win')).toMatchObject({
      target: 1,
      xpReward: 100,
    });
    expect(
      GAME_ACHIEVEMENTS.find((a) => a.key === 'spin_specialist'),
    ).toMatchObject({ target: 10, xpReward: 150 });
  });
  const db = {
    achievement: { upsert: jest.fn() },
    userAchievement: { findMany: jest.fn(), createMany: jest.fn() },
  };
  const tx = db as unknown as Prisma.TransactionClient;
  const empty = { wins: 0, totalGames: 0, totalTSpins: 0, totalTetrises: 0 };
  beforeEach(() => {
    jest.resetAllMocks();
    db.userAchievement.findMany.mockResolvedValue([]);
    db.achievement.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: create.key,
    }));
    db.userAchievement.createMany.mockResolvedValue({ count: 1 });
  });

  it.each(GAME_ACHIEVEMENTS)(
    'awards $key at its exact threshold, never below',
    async (item) => {
      // Other unlocked thresholds are already owned so each boundary is isolated.
      db.userAchievement.findMany.mockResolvedValue(
        GAME_ACHIEVEMENTS.filter((a) => a.key !== item.key).map((a) => ({
          achievement: { key: a.key },
        })),
      );
      expect(
        await awardGameAchievements(tx, 'owner', {
          ...empty,
          [item.metric]: item.target - 1,
        }),
      ).toBe(0);
      expect(
        await awardGameAchievements(tx, 'owner', {
          ...empty,
          [item.metric]: item.target,
        }),
      ).toBe(item.xpReward);
      expect(db.userAchievement.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'owner', achievementId: item.key }],
        skipDuplicates: true,
      });
    },
  );

  it('adds simultaneous rewards and never rewards already owned achievements', async () => {
    const progress = {
      wins: 10,
      totalGames: 100,
      totalTSpins: 10,
      totalTetrises: 100,
    };
    const expected = GAME_ACHIEVEMENTS.filter(
      (a) => (progress[a.metric as keyof typeof progress] ?? 0) >= a.target,
    ).reduce((sum, a) => sum + a.xpReward, 0);
    expect(await awardGameAchievements(tx, 'owner', progress)).toBe(expected);
    db.userAchievement.findMany.mockResolvedValue(
      GAME_ACHIEVEMENTS.map((a) => ({ achievement: { key: a.key } })),
    );
    db.userAchievement.createMany.mockClear();
    expect(await awardGameAchievements(tx, 'owner', progress)).toBe(0);
    expect(db.userAchievement.createMany).not.toHaveBeenCalled();
  });

  it('does not reward an insertion rejected by the duplicate constraint', async () => {
    db.userAchievement.createMany.mockResolvedValue({ count: 0 });
    expect(
      await awardGameAchievements(tx, 'owner', { ...empty, wins: 1 }),
    ).toBe(0);
  });

  it('propagates award failures so the enclosing result transaction rolls back', async () => {
    db.achievement.upsert.mockRejectedValue(new Error('failed'));
    await expect(
      awardGameAchievements(tx, 'owner', { ...empty, wins: 1 }),
    ).rejects.toThrow('failed');
  });
});
