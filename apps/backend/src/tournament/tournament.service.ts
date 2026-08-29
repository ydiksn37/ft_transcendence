import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TournamentService {
  private readonly logger = new Logger(TournamentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTournament(
    creatorId: string,
    data: {
      name: string;
      description?: string;
      maxPlayers: 4 | 8 | 16;
      registrationDeadline?: string;
    },
  ) {
    return this.prisma.tournament.create({
      data: {
        name: data.name,
        description: data.description,
        creatorId,
        maxPlayers: data.maxPlayers,
        minPlayers: 4,
        registrationDeadline: data.registrationDeadline
          ? new Date(data.registrationDeadline)
          : undefined,
        status: 'REGISTRATION',
      },
    });
  }

  async listTournaments(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.tournament.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          creator: { select: { id: true, username: true, displayName: true } },
          winner: { select: { id: true, username: true } },
          _count: { select: { entries: true } },
        },
      }),
      this.prisma.tournament.count(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getTournamentBracket(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        matches: {
          include: {
            player1: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            player2: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            winner: { select: { id: true, username: true } },
          },
          orderBy: [{ round: 'asc' }, { matchNumber: 'asc' }],
        },
        entries: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!tournament)
      throw new NotFoundException('トーナメントが見つかりません');

    // ラウンドごとにグループ化
    const rounds = tournament.matches.reduce(
      (acc: any, match: any) => {
        if (!acc[match.round]) acc[match.round] = [];
        acc[match.round].push(match);
        return acc;
      },
      {} as Record<number, typeof tournament.matches>,
    );

    return { tournament, rounds, entries: tournament.entries };
  }

  async joinTournament(tournamentId: string, userId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { _count: { select: { entries: true } } },
    });

    if (!tournament)
      throw new NotFoundException('トーナメントが見つかりません');
    if (tournament.status !== 'REGISTRATION') {
      throw new BadRequestException('参加受付中のトーナメントではありません');
    }
    if (tournament._count.entries >= tournament.maxPlayers) {
      throw new BadRequestException('定員に達しています');
    }

    const existing = await this.prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (existing) throw new BadRequestException('既に参加済みです');

    return this.prisma.tournamentEntry.create({
      data: { tournamentId, userId },
    });
  }

  async startTournament(tournamentId: string, requesterId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { entries: true },
    });

    if (!tournament)
      throw new NotFoundException('トーナメントが見つかりません');
    if (tournament.creatorId !== requesterId) {
      throw new ForbiddenException('トーナメント作成者のみ開始できます');
    }
    if (tournament.status !== 'REGISTRATION') {
      throw new BadRequestException('受付中のトーナメントのみ開始できます');
    }
    if (tournament.entries.length < tournament.minPlayers) {
      throw new BadRequestException(
        `最低${tournament.minPlayers}名の参加者が必要です（現在: ${tournament.entries.length}名）`,
      );
    }

    // シングルエリミネーション ブラケット生成
    const participants = tournament.entries.sort(() => Math.random() - 0.5);
    const matches = this.generateBracket(
      tournamentId,
      participants.map((e: any) => e.userId),
    );

    await this.prisma.$transaction([
      this.prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      }),
      ...matches.map((m) => this.prisma.tournamentMatch.create({ data: m })),
    ]);

    this.logger.log(`トーナメント開始: ${tournament.name}`);
    return {
      message: 'トーナメントを開始しました',
      matchesCreated: matches.length,
    };
  }

  private generateBracket(tournamentId: string, playerIds: string[]) {
    const matches: any[] = [];
    let matchNumber = 1;
    const round = 1;

    for (let i = 0; i < playerIds.length; i += 2) {
      matches.push({
        tournamentId,
        round,
        matchNumber: matchNumber++,
        player1Id: playerIds[i] ?? null,
        player2Id: playerIds[i + 1] ?? null,
        status: playerIds[i + 1] ? 'PENDING' : 'BYE',
      });
    }
    return matches;
  }
}
