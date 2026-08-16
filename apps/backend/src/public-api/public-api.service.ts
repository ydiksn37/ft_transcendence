import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicApiService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 1. グローバルランキング ───────────────────────────────
  async getLeaderboard(page = 1, limit = 20, rankFilter?: string) {
    const skip = (page - 1) * Math.min(limit, 100);

    const where = {
      deletedAt: null,
      ...(rankFilter ? { stats: { rank: rankFilter as any } } : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isOnline: true,
          stats: {
            select: {
              rank: true,
              rankPoints: true,
              winRate: true,
              wins: true,
              losses: true,
              totalGames: true,
              bestApm: true,
              avgApm: true,
              bestPps: true,
            },
          },
        },
        orderBy: { stats: { rankPoints: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── 2. ユーザープロフィール (by username) ─────────────────
  async getUserByUsername(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isOnline: true,
        lastSeenAt: true,
        createdAt: true,
        stats: {
          select: {
            rank: true,
            rankPoints: true,
            winRate: true,
            wins: true,
            losses: true,
            totalGames: true,
            level: true,
            xp: true,
          },
        },
      },
    });

    if (!user) return null;
    return user;
  }

  // ── 3. ユーザー統計 ───────────────────────────────────────
  async getUserStats(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: { id: true },
    });
    if (!user) return null;

    return this.prisma.userStats.findUnique({ where: { userId: user.id } });
  }

  // ── 4. 対戦履歴 ───────────────────────────────────────────
  async getUserHistory(username: string, page = 1, limit = 20, mode?: string) {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: { id: true },
    });
    if (!user) return null;

    const skip = (page - 1) * Math.min(limit, 50);
    const where = {
      OR: [{ player1Id: user.id }, { player2Id: user.id }],
      ...(mode ? { gameMode: mode as any } : {}),
    };

    const [results, total] = await Promise.all([
      this.prisma.gameResult.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          gameMode: true,
          durationSeconds: true,
          isAiGame: true,
          aiDifficulty: true,
          player1Apm: true,
          player2Apm: true,
          player1Pps: true,
          player2Pps: true,
          player1LinesCleared: true,
          player2LinesCleared: true,
          player1: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
          player2: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
          winner: { select: { username: true } },
        },
      }),
      this.prisma.gameResult.count({ where }),
    ]);

    return {
      data: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── 5. トーナメント一覧 ───────────────────────────────────
  async getTournaments(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * Math.min(limit, 50);
    const where = status ? { status: status as any } : {};

    const [tournaments, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          maxPlayers: true,
          minPlayers: true,
          registrationDeadline: true,
          startedAt: true,
          endedAt: true,
          createdAt: true,
          creator: { select: { username: true, displayName: true } },
          winner: { select: { username: true, displayName: true } },
          _count: { select: { entries: true } },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);

    return {
      data: tournaments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
