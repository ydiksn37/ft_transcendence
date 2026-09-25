import type { Prisma } from '@prisma/client';
import { awardGameAchievements, GAME_ACHIEVEMENTS } from './achievements';

describe('game achievements', () => {
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
    expect(await awardGameAchievements(tx, 'owner', progress)).toBe(950);
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
