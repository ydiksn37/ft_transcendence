import { Injectable, Logger } from '@nestjs/common';
import type { AiDifficulty } from '@transcendence/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 対戦結果を DB に保存し、統計を更新する */
  async saveResult(data: {
    roomId: string;
    player1Id: string | null;
    player2Id: string | null;
    winnerId: string | null;
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
    player1Tetrises: number;
    player2Tetrises: number;
    garbageSent1to2: number;
    garbageSent2to1: number;
    durationSeconds: number;
    gameMode: 'VERSUS' | 'AI' | 'TOURNAMENT';
    tournamentMatchId?: string;
  }) {
    const result = await this.prisma.gameResult.create({
      data: {
        roomId: data.roomId,
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
        player1Tetrises: data.player1Tetrises,
        player2Tetrises: data.player2Tetrises,
        garbageSent1to2: data.garbageSent1to2,
        garbageSent2to1: data.garbageSent2to1,
        durationSeconds: data.durationSeconds,
        gameMode: data.gameMode,
        tournamentMatchId: data.tournamentMatchId,
      },
    });

    // 統計を非同期で更新
    if (data.player1Id) {
      this.updateStats(
        data.player1Id,
        data.winnerId === data.player1Id,
        data.player1Apm,
        data.player1Pps,
        data.player1LinesCleared,
      ).catch(this.logger.error.bind(this.logger));
    }
    if (data.player2Id && !data.isAiGame) {
      this.updateStats(
        data.player2Id,
        data.winnerId === data.player2Id,
        data.player2Apm,
        data.player2Pps,
        data.player2LinesCleared,
      ).catch(this.logger.error.bind(this.logger));
    }

    return result;
  }

  /** ユーザー統計を更新 */
  private async updateStats(
    userId: string,
    won: boolean,
    apm: number,
    pps: number,
    linesCleared: number,
  ) {
    const stats = await this.prisma.userStats.findUnique({ where: { userId } });
    if (!stats) return;

    const totalGames = stats.totalGames + 1;
    const wins = won ? stats.wins + 1 : stats.wins;
    const losses = won ? stats.losses : stats.losses + 1;
    const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

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

    const currentWinStreak = won ? stats.currentWinStreak + 1 : 0;
    const bestWinStreak = Math.max(stats.bestWinStreak, currentWinStreak);

    // XP計算
    const xpGain = won ? 50 : 20;
    const newXp = stats.xp + xpGain;
    const newLevel = Math.floor(newXp / 1000) + 1;

    await this.prisma.userStats.update({
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
        currentWinStreak,
        bestWinStreak,
        xp: newXp,
        level: newLevel,
      },
    });

    // 日次集計更新
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await this.prisma.gameAnalytic.upsert({
      where: { userId_date: { userId, date: today } },
      update: {
        gamesPlayed: { increment: 1 },
        wins: { increment: won ? 1 : 0 },
        losses: { increment: won ? 0 : 1 },
      },
      create: {
        userId,
        date: today,
        gamesPlayed: 1,
        wins: won ? 1 : 0,
        losses: won ? 0 : 1,
      },
    });
  }
}
