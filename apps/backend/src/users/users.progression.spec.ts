import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { GAME_ACHIEVEMENTS } from '../game/achievements';

describe('user progression', () => {
  const findUnique = jest.fn();
  const service = new UsersService({
    user: { findUnique },
  } as unknown as PrismaService);
  beforeEach(() => jest.resetAllMocks());

  it('returns defaults and all locked goals for an account without statistics', async () => {
    findUnique.mockResolvedValue({ stats: null, achievements: [] });
    const result = await service.getProgression('owner');
    expect(result).toMatchObject({
      xp: 0,
      level: 1,
      levelProgress: 0,
      rank: 'BRONZE',
      rankPoints: 0,
    });
    expect(result.achievements).toHaveLength(GAME_ACHIEVEMENTS.length);
    expect(
      result.achievements.every((a) => a.progress === 0 && a.earnedAt === null),
    ).toBe(true);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'owner' } }),
    );
  });

  it('clamps progress and distinguishes attained thresholds from awarded achievements', async () => {
    const earnedAt = new Date('2026-09-24T00:00:00Z');
    findUnique.mockResolvedValue({
      stats: {
        xp: 1234,
        level: 2,
        rank: 'SILVER',
        rankPoints: 515,
        wins: 12,
        totalGames: 50,
        totalTSpins: 4,
        totalTetrises: 8,
      },
      achievements: [
        { earnedAt, achievement: { key: 'first_win', xpReward: 100 } },
      ],
    });
    const result = await service.getProgression('owner');
    expect(result).toMatchObject({ levelProgress: 234, levelTarget: 1000 });
    expect(result.achievements[0]).toMatchObject({ progress: 1, earnedAt });
    expect(result.achievements[1]).toMatchObject({
      progress: 10,
      earnedAt: null,
    });
    expect(
      result.achievements.find((a) => a.key === 'hundred_games'),
    ).toMatchObject({ progress: 50, target: 100, group: 'games', tier: 5 });
    expect(
      result.achievements.find((a) => a.key === 'i_spins_1'),
    ).toMatchObject({ progress: 0, target: 1 });
  });

  it('rejects missing or deleted accounts', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.getProgression('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
