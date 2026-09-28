import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GameService } from './game.service';
import { PrismaService } from '../prisma/prisma.service';
import { GAME_ACHIEVEMENTS } from './achievements';

describe('GameService result/statistics transaction', () => {
  const initial = {
    totalGames: 2,
    wins: 1,
    losses: 1,
    avgApm: 20,
    avgPps: 1,
    bestApm: 30,
    bestPps: 2,
    currentWinStreak: 0,
    bestWinStreak: 1,
    xp: 990,
    rankPoints: 490,
    totalLinesCleared: 10,
    totalTSpins: 2,
    totalTetrises: 3,
  };
  const data = {
    roomId: 'room',
    player1Id: 'alice',
    player2Id: 'bob',
    winnerId: 'alice',
    isAiGame: false,
    player1Apm: 40,
    player2Apm: 10,
    player1Pps: 2,
    player2Pps: 1,
    player1LinesCleared: 8,
    player2LinesCleared: 4,
    player1TSpins: 2,
    player2TSpins: 1,
    player1Tetrises: 1,
    player2Tetrises: 0,
    garbageSent1to2: 8,
    garbageSent2to1: 4,
    durationSeconds: 60,
    gameMode: 'VERSUS' as const,
  };
  const tx = {
    gameResult: { create: jest.fn() },
    userStats: { upsert: jest.fn(), update: jest.fn() },
    gameAnalytic: { upsert: jest.fn(), findUnique: jest.fn() },
    userAchievement: { findMany: jest.fn(), createMany: jest.fn() },
    achievement: { upsert: jest.fn() },
  };
  const transaction = jest.fn();
  const service = new GameService({
    $transaction: transaction,
  } as unknown as PrismaService);
  const conflict = () =>
    new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: '6.12.0',
    });
  beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockImplementation(async (fn) => fn(tx));
    tx.gameResult.create.mockResolvedValue({ id: 'result' });
    tx.userStats.upsert.mockResolvedValue(initial);
    tx.userAchievement.findMany.mockResolvedValue(
      GAME_ACHIEVEMENTS.map((a) => ({ achievement: { key: a.key } })),
    );
    tx.gameAnalytic.findUnique.mockResolvedValue(null);
  });

  it('awaits both players and accumulates spins/tetrises within the result transaction', async () => {
    await expect(service.saveResult(data)).resolves.toEqual({ id: 'result' });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.userStats.update).toHaveBeenCalledTimes(2);
    expect(tx.userStats.update).toHaveBeenCalledWith({
      where: { userId: 'alice' },
      data: expect.objectContaining({
        wins: 2,
        losses: 1,
        totalGames: 3,
        totalTSpins: 4,
        totalTetrises: 4,
        totalLinesCleared: 18,
        xp: 1040,
        level: 2,
        rankPoints: 515,
        rank: 'SILVER',
      }),
    });
    expect(tx.userStats.update).toHaveBeenCalledWith({
      where: { userId: 'bob' },
      data: expect.objectContaining({
        wins: 1,
        losses: 2,
        totalTSpins: 3,
        totalTetrises: 3,
      }),
    });
    expect(tx.gameAnalytic.upsert).toHaveBeenCalledTimes(2);
    expect(tx.userStats.upsert).toHaveBeenCalledWith({
      where: { userId: 'alice' },
      create: { userId: 'alice' },
      update: {},
    });
  });

  it('stores and accumulates all five non-T spin counters for both players', async () => {
    const spins = { I: 1, J: 2, L: 3, S: 4, Z: 5 };
    await service.saveResult({
      ...data,
      player1OtherSpins: spins,
      player2OtherSpins: { S: 2 },
    });
    expect(tx.gameResult.create.mock.calls[0][0].data).toMatchObject({
      player1OtherSpins: spins,
      player2OtherSpins: { S: 2 },
    });
    expect(tx.userStats.update.mock.calls[0][0].data).toMatchObject({
      totalISpins: 1,
      totalJSpins: 2,
      totalLSpins: 3,
      totalSSpins: 4,
      totalZSpins: 5,
    });
    expect(tx.userStats.update.mock.calls[1][0].data).toMatchObject({
      totalISpins: 0,
      totalSSpins: 2,
    });
  });

  it('propagates a statistics failure to the transaction instead of reporting success', async () => {
    const failure = new Error('database failure');
    tx.userStats.update.mockRejectedValueOnce(failure);
    await expect(service.saveResult(data)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('retries only serialization conflicts and returns 409 after three conflicts', async () => {
    transaction.mockRejectedValueOnce(conflict());
    await expect(service.saveResult(data)).resolves.toEqual({ id: 'result' });
    expect(transaction).toHaveBeenCalledTimes(2);
    transaction.mockClear().mockRejectedValue(conflict());
    await expect(service.saveResult(data)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not create statistics for guests or an AI opponent', async () => {
    await service.saveResult({
      ...data,
      player1Id: null,
      player2Id: null,
      winnerId: null,
      isAiGame: true,
    });
    expect(tx.gameResult.create).toHaveBeenCalledTimes(1);
    expect(tx.userStats.upsert).not.toHaveBeenCalled();
  });

  it.each(['MARATHON', 'LINES_40'] as const)(
    'does not count %s as a ranked win',
    async (gameMode) => {
      await service.saveResult({ ...data, gameMode, player2Id: null });
      const update = tx.userStats.update.mock.calls[0][0].data;
      expect(update).toMatchObject({
        wins: 1,
        losses: 1,
        totalGames: 3,
        xp: 1010,
        winRate: 50,
      });
      expect(update).not.toHaveProperty('rankPoints');
    },
  );

  it('distinguishes draws from losses to guests or AI without a winner user ID', async () => {
    await service.saveResult({ ...data, winnerId: null, winnerPlayer: null });
    expect(tx.userStats.update.mock.calls[0][0].data).toMatchObject({
      wins: 1,
      losses: 1,
      rankPoints: 490,
    });
    tx.userStats.update.mockClear();
    await service.saveResult({
      ...data,
      player2Id: null,
      winnerId: null,
      winnerPlayer: 2,
      isAiGame: true,
    });
    const update = tx.userStats.update.mock.calls[0][0].data;
    expect(update).toMatchObject({ wins: 1, losses: 2 });
    expect(update).not.toHaveProperty('rankPoints');
  });

  it('floors rank points at zero after a loss', async () => {
    tx.userStats.upsert.mockResolvedValue({ ...initial, rankPoints: 5 });
    await service.saveResult({ ...data, winnerId: 'bob' });
    expect(tx.userStats.update.mock.calls[0][0].data).toMatchObject({
      rankPoints: 0,
      rank: 'BRONZE',
    });
  });

  it('includes newly earned achievement XP in the saved level', async () => {
    tx.userStats.upsert.mockResolvedValue({ ...initial, wins: 0, xp: 900 });
    tx.userAchievement.findMany.mockResolvedValue(
      GAME_ACHIEVEMENTS.filter((a) => a.key !== 'first_win').map((a) => ({
        achievement: { key: a.key },
      })),
    );
    tx.achievement.upsert.mockResolvedValue({ id: 'first', xpReward: 100 });
    tx.userAchievement.createMany.mockResolvedValue({ count: 1 });
    await service.saveResult({ ...data, player2Id: null, isAiGame: true });
    expect(tx.userStats.update.mock.calls[0][0].data).toMatchObject({
      xp: 1050,
      level: 2,
    });
  });

  it('initializes all daily metrics and uses one UTC date for both players', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T23:59:59Z'));
    try {
      await service.saveResult(data);
      expect(tx.gameAnalytic.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_date: {
              userId: 'alice',
              date: new Date('2026-09-24T00:00:00Z'),
            },
          },
          create: expect.objectContaining({
            gamesPlayed: 1,
            wins: 1,
            losses: 0,
            avgApm: 40,
            avgPps: 2,
            totalLinesCleared: 8,
            totalPlaytimeSeconds: 60,
          }),
        }),
      );
      expect(tx.gameAnalytic.upsert.mock.calls[1][0].create).toMatchObject({
        avgApm: 10,
        avgPps: 1,
        totalLinesCleared: 4,
        totalPlaytimeSeconds: 60,
      });
      expect(tx.gameResult.create.mock.calls[0][0].data.createdAt).toEqual(
        new Date('2026-09-24T23:59:59Z'),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('weights daily averages by prior games, not the lifetime game count', async () => {
    tx.gameAnalytic.findUnique.mockResolvedValue({
      gamesPlayed: 3,
      avgApm: new Prisma.Decimal(20),
      avgPps: new Prisma.Decimal(1),
    });
    await service.saveResult(data);
    expect(tx.gameAnalytic.upsert.mock.calls[0][0].update).toMatchObject({
      gamesPlayed: { increment: 1 },
      avgApm: 25,
      avgPps: 1.25,
      totalLinesCleared: { increment: 8 },
      totalPlaytimeSeconds: { increment: 60 },
    });
  });
});
