import { ConflictException, Injectable } from '@nestjs/common';
import type { AiDifficulty, OtherSpinCounts } from '@transcendence/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { GameMode } from '@prisma/client';
import { Prisma, Rank } from '@prisma/client';
import { awardGameAchievements } from './achievements';

@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

  /** 対戦結果を DB に保存し、統計を更新する */
  async saveResult(data: {
    roomId: string;
    player1Id: string | null;
    player2Id: string | null;
    winnerId: string | null;
    winnerPlayer?: 1 | 2 | null;
    isAiGame: boolean;
    aiDifficulty?: AiDifficulty;
    player1Apm: number;
    player2Apm: number;
    player1Pps: number;
    player2Pps: number;
    player1LinesCleared: number;
    player2LinesCleared: number;
    player1TSpins: number;
    player2TSpins: number;
    player1OtherSpins?: Partial<OtherSpinCounts>;
    player2OtherSpins?: Partial<OtherSpinCounts>;
    player1Tetrises: number;
    player2Tetrises: number;
    garbageSent1to2: number;
    garbageSent2to1: number;
    durationSeconds: number;
    gameMode: GameMode;
    tournamentMatchId?: string;
  }) {
    const completedAt = new Date();
    const solo = data.gameMode === 'MARATHON' || data.gameMode === 'LINES_40';
    const winner =
      data.winnerPlayer !== undefined
        ? data.winnerPlayer
        : data.winnerId === data.player1Id && data.player1Id
          ? 1
          : data.winnerId === data.player2Id && data.player2Id
            ? 2
            : null;
    const outcome = (player: 1 | 2): 'win' | 'loss' | 'neutral' =>
      solo || winner === null ? 'neutral' : winner === player ? 'win' : 'loss';
    const ranked =
      !data.isAiGame &&
      !solo &&
      !!data.player1Id &&
      !!data.player2Id &&
      data.player1Id !== data.player2Id;
    // Retry serialization conflicts, never leave a result with partial statistics.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const result = await tx.gameResult.create({
              data: {
                roomId: data.roomId,
                createdAt: completedAt,
                player1Id: data.player1Id,
                player2Id: data.player2Id,
                winnerId: data.winnerId,
                isAiGame: data.isAiGame,
                aiDifficulty: data.aiDifficulty,
                player1Apm: data.player1Apm,
                player2Apm: data.player2Apm,
                player1Pps: data.player1Pps,
                player2Pps: data.player2Pps,
                player1LinesCleared: data.player1LinesCleared,
                player2LinesCleared: data.player2LinesCleared,
                player1TSpins: data.player1TSpins,
                player2TSpins: data.player2TSpins,
                player1OtherSpins: data.player1OtherSpins ?? {},
                player2OtherSpins: data.player2OtherSpins ?? {},
                player1Tetrises: data.player1Tetrises,
                player2Tetrises: data.player2Tetrises,
                garbageSent1to2: data.garbageSent1to2,
                garbageSent2to1: data.garbageSent2to1,
                durationSeconds: data.durationSeconds,
                gameMode: data.gameMode,
                tournamentMatchId: data.tournamentMatchId,
              },
            });

            // Result and both players' statistics commit together.
            if (data.player1Id) {
              await this.updateStats(
                tx,
                data.player1Id,
                outcome(1),
                ranked,
                data.player1Apm,
                data.player1Pps,
                data.player1LinesCleared,
                data.player1TSpins,
                data.player1Tetrises,
                data.durationSeconds,
                completedAt,
                data.player1OtherSpins ?? {},
              );
            }
            if (data.player2Id && !data.isAiGame) {
              await this.updateStats(
                tx,
                data.player2Id,
                outcome(2),
                ranked,
                data.player2Apm,
                data.player2Pps,
                data.player2LinesCleared,
                data.player2TSpins,
                data.player2Tetrises,
                data.durationSeconds,
                completedAt,
                data.player2OtherSpins ?? {},
              );
            }

            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034'
        )
          throw error;
        if (attempt === 2)
          throw new ConflictException(
            '試合結果の保存が競合しました。再試行してください',
          );
      }
    }

    throw new ConflictException(
      '試合結果の保存が競合しました。再試行してください',
    );
  }

  /** ユーザー統計を更新 */
  private async updateStats(
    tx: Prisma.TransactionClient,
    userId: string,
    outcome: 'win' | 'loss' | 'neutral',
    ranked: boolean,
    apm: number,
    pps: number,
    linesCleared: number,
    tSpins: number,
    tetrises: number,
    durationSeconds: number,
    completedAt: Date,
    otherSpins: Partial<OtherSpinCounts> = {},
  ) {
    const stats = await tx.userStats.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const won = outcome === 'win';
    const lost = outcome === 'loss';
    const totalGames = stats.totalGames + 1;
    const wins = won ? stats.wins + 1 : stats.wins;
    const losses = stats.losses + (lost ? 1 : 0);
    const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

    const safeNum = (val: any) => {
      const n = Number(val);
      return isNaN(n) ? 0 : n;
    };

    const avgApm =
      (safeNum(stats.avgApm) * stats.totalGames + (isNaN(apm) ? 0 : apm)) /
      totalGames;
    const avgPps =
      (safeNum(stats.avgPps) * stats.totalGames + (isNaN(pps) ? 0 : pps)) /
      totalGames;
    const bestApm = Math.max(safeNum(stats.bestApm), isNaN(apm) ? 0 : apm);
    const bestPps = Math.max(safeNum(stats.bestPps), isNaN(pps) ? 0 : pps);

    const currentWinStreak = won
      ? stats.currentWinStreak + 1
      : lost
        ? 0
        : stats.currentWinStreak;
    const bestWinStreak = Math.max(stats.bestWinStreak, currentWinStreak);

    // XP計算
    const xpGain = won ? 50 : 20;
    const spinTotals = {
      totalISpins: (stats.totalISpins ?? 0) + (otherSpins.I ?? 0),
      totalJSpins: (stats.totalJSpins ?? 0) + (otherSpins.J ?? 0),
      totalLSpins: (stats.totalLSpins ?? 0) + (otherSpins.L ?? 0),
      totalSSpins: (stats.totalSSpins ?? 0) + (otherSpins.S ?? 0),
      totalZSpins: (stats.totalZSpins ?? 0) + (otherSpins.Z ?? 0),
    };
    const rewardXp = await awardGameAchievements(tx, userId, {
      ...spinTotals,
      totalLinesCleared: stats.totalLinesCleared + linesCleared,
      bestWinStreak,
      wins,
      totalGames,
      totalTSpins: stats.totalTSpins + tSpins,
      totalTetrises: stats.totalTetrises + tetrises,
    });
    const newXp = stats.xp + xpGain + rewardXp;
    const newLevel = Math.floor(newXp / 1000) + 1;
    const rankPoints = Math.max(
      0,
      stats.rankPoints + (ranked ? (won ? 25 : lost ? -15 : 0) : 0),
    );
    const ranks: Rank[] = [
      'BRONZE',
      'SILVER',
      'GOLD',
      'PLATINUM',
      'DIAMOND',
      'MASTER',
    ];

    await tx.userStats.update({
      where: { userId },
      data: {
        wins,
        losses,
        totalGames,
        winRate,
        avgApm,
        bestApm,
        avgPps,
        bestPps,
        totalLinesCleared: stats.totalLinesCleared + linesCleared,
        totalTSpins: stats.totalTSpins + tSpins,
        totalTetrises: stats.totalTetrises + tetrises,
        ...spinTotals,
        currentWinStreak,
        bestWinStreak,
        xp: newXp,
        level: newLevel,
        ...(ranked
          ? {
              rankPoints,
              rank: ranks[Math.min(5, Math.floor(rankPoints / 500))],
            }
          : {}),
      },
    });

    // 日次集計更新
    // UTC date is shared by both players and stays fixed across transaction retries.
    const today = new Date(completedAt);
    today.setUTCHours(0, 0, 0, 0);
    const daily = await tx.gameAnalytic.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    const gamesToday = daily?.gamesPlayed ?? 0;
    const dailyApm =
      (safeNum(daily?.avgApm ?? 0) * gamesToday + apm) / (gamesToday + 1);
    const dailyPps =
      (safeNum(daily?.avgPps ?? 0) * gamesToday + pps) / (gamesToday + 1);
    await tx.gameAnalytic.upsert({
      where: { userId_date: { userId, date: today } },
      update: {
        gamesPlayed: { increment: 1 },
        wins: { increment: won ? 1 : 0 },
        losses: { increment: lost ? 1 : 0 },
        avgApm: dailyApm,
        avgPps: dailyPps,
        totalLinesCleared: { increment: linesCleared },
        totalPlaytimeSeconds: { increment: durationSeconds },
      },
      create: {
        userId,
        date: today,
        gamesPlayed: 1,
        wins: won ? 1 : 0,
        losses: lost ? 1 : 0,
        avgApm: apm,
        avgPps: pps,
        totalLinesCleared: linesCleared,
        totalPlaytimeSeconds: durationSeconds,
      },
    });
  }
}
