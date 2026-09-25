import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PublicGameSettingsDto } from './dto/public-api.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { GameMode, Rank, TournamentStatus } from '@prisma/client';

@Injectable()
export class PublicApiService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string) {
    const settings = await this.prisma.userGameSettings.findUnique({
      where: { userId },
    });
    if (!settings) throw new NotFoundException('ゲーム設定が見つかりません');
    return settings;
  }

  private settingsData(dto: PublicGameSettingsDto) {
    // PUT replaces the resource: omitted/null fields reset to schema defaults.
    return {
      minoSkin: dto.minoSkin ?? ('NEON' as const),
      showGhost: dto.showGhost ?? true,
      displayTheme: dto.displayTheme ?? ('CYBER' as const),
      mapStyle: dto.mapStyle ?? ('GRID' as const),
      backgroundStyle: dto.backgroundStyle ?? ('MATRIX' as const),
      arr: dto.arr ?? 33,
      das: dto.das ?? 170,
      dcd: dto.dcd ?? 0,
      sdf: dto.sdf ?? 6,
      keyBindings: dto.keyBindings ? { ...dto.keyBindings } : Prisma.DbNull,
      volume: dto.volume ?? 100,
      sfxEnabled: dto.sfxEnabled ?? true,
      musicEnabled: dto.musicEnabled ?? true,
    };
  }

  async createSettings(userId: string, dto: PublicGameSettingsDto) {
    try {
      return await this.prisma.userGameSettings.create({
        data: { userId, ...this.settingsData(dto) },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          '設定は既に存在します。PUTで置き換えてください',
        );
      throw error;
    }
  }

  async replaceSettings(userId: string, dto: PublicGameSettingsDto) {
    try {
      return await this.prisma.userGameSettings.update({
        where: { userId },
        data: this.settingsData(dto),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundException('設定がありません。POSTで作成してください');
      throw error;
    }
  }

  async deleteSettings(userId: string) {
    await this.prisma.userGameSettings.deleteMany({ where: { userId } });
  }

  // ── 1. グローバルランキング ───────────────────────────────
  async getLeaderboard(page = 1, limit = 20, rankFilter?: Rank) {
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(rankFilter ? { stats: { rank: rankFilter } } : {}),
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
        orderBy: [{ stats: { rankPoints: 'desc' } }, { id: 'asc' }],
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
  async getUserHistory(
    username: string,
    page = 1,
    limit = 20,
    mode?: GameMode,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: { id: true },
    });
    if (!user) return null;

    const skip = (page - 1) * limit;
    const where = {
      OR: [{ player1Id: user.id }, { player2Id: user.id }],
      ...(mode ? { gameMode: mode } : {}),
    };

    const [results, total] = await Promise.all([
      this.prisma.gameResult.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
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
  async getTournaments(page = 1, limit = 20, status?: TournamentStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [tournaments, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
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
