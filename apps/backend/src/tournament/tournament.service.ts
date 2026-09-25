import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/tournament.dto';
import type { MatchStatus, Prisma } from '@prisma/client';

export interface LiveTournamentMatch {
  clientMatchId: string;
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  status: MatchStatus;
}

@Injectable()
export class TournamentService {
  private readonly logger = new Logger(TournamentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTournament(creatorId: string, data: CreateTournamentDto) {
    if (
      data.registrationDeadline &&
      new Date(data.registrationDeadline) <= new Date()
    ) {
      throw new BadRequestException('登録期限は未来の日時にしてください');
    }
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
    const rounds: Record<number, (typeof tournament.matches)[number][]> = {};
    for (const match of tournament.matches) {
      (rounds[match.round] ??= []).push(match);
    }

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

  async createLiveTournament(
    name: string,
    creatorId: string,
    participantIds: string[],
    matches: LiveTournamentMatch[],
  ) {
    const uniqueParticipants = [...new Set(participantIds)];
    if (
      uniqueParticipants.length !== participantIds.length ||
      ![4, 8, 16].includes(uniqueParticipants.length)
    ) {
      throw new BadRequestException(
        'トーナメントは重複のない4、8、16名の認証ユーザーが必要です',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          name,
          creatorId,
          maxPlayers: uniqueParticipants.length,
          minPlayers: 4,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });
      await tx.tournamentEntry.createMany({
        data: uniqueParticipants.map((userId, index) => ({
          tournamentId: tournament.id,
          userId,
          seed: index + 1,
        })),
      });
      const matchIds: Record<string, string> = {};
      for (const match of matches) {
        const created = await tx.tournamentMatch.create({
          data: {
            tournamentId: tournament.id,
            round: match.round,
            matchNumber: match.matchNumber,
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            status: match.status,
          },
        });
        matchIds[match.clientMatchId] = created.id;
      }
      return { tournamentId: tournament.id, matchIds };
    });
  }

  async completeLiveMatch(
    tournamentId: string,
    matchId: string,
    winnerId: string,
    gameResultId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.tournamentMatch.findUnique({
        where: { id: matchId },
      });
      if (!match || match.tournamentId !== tournamentId)
        throw new NotFoundException('トーナメント試合が見つかりません');
      if (match.status === 'COMPLETED') return match;
      if (winnerId !== match.player1Id && winnerId !== match.player2Id)
        throw new BadRequestException('勝者が試合参加者ではありません');

      const completed = await tx.tournamentMatch.update({
        where: { id: matchId },
        data: {
          winnerId,
          gameResultId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      const nextRound = match.round + 1;
      const nextMatchNumber = Math.ceil(match.matchNumber / 2);
      const next = await tx.tournamentMatch.findUnique({
        where: {
          tournamentId_round_matchNumber: {
            tournamentId,
            round: nextRound,
            matchNumber: nextMatchNumber,
          },
        },
      });
      if (!next) {
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { status: 'COMPLETED', winnerId, endedAt: new Date() },
        });
        await tx.tournamentEntry.update({
          where: { tournamentId_userId: { tournamentId, userId: winnerId } },
          data: { finalRank: 1 },
        });
        return completed;
      }
      const playerField =
        match.matchNumber % 2 === 1 ? 'player1Id' : 'player2Id';
      await tx.tournamentMatch.update({
        where: { id: next.id },
        data: { [playerField]: winnerId },
      });
      return completed;
    });
  }

  async markLiveMatchStarted(tournamentId: string, matchId: string) {
    return this.prisma.tournamentMatch.updateMany({
      where: {
        id: matchId,
        tournamentId,
        status: 'PENDING',
      },
      data: { status: 'IN_PROGRESS', scheduledAt: new Date() },
    });
  }

  private generateBracket(tournamentId: string, playerIds: string[]) {
    const bracketSize = 2 ** Math.ceil(Math.log2(playerIds.length));
    const totalRounds = Math.log2(bracketSize);
    const matches: Prisma.TournamentMatchUncheckedCreateInput[] = [];
    for (let round = 1; round <= totalRounds; round++) {
      const matchCount = bracketSize / 2 ** round;
      for (let index = 0; index < matchCount; index++) {
        const player1Id = round === 1 ? (playerIds[index * 2] ?? null) : null;
        const player2Id =
          round === 1 ? (playerIds[index * 2 + 1] ?? null) : null;
        const byeWinner =
          round === 1 && Boolean(player1Id) !== Boolean(player2Id)
            ? (player1Id ?? player2Id)
            : null;
        matches.push({
          tournamentId,
          round,
          matchNumber: index + 1,
          player1Id,
          player2Id,
          winnerId: byeWinner,
          status: byeWinner ? 'BYE' : 'PENDING',
          completedAt: byeWinner ? new Date() : null,
        });
      }
    }

    for (const bye of matches.filter(
      (match) => match.round === 1 && match.status === 'BYE',
    )) {
      const next = matches.find(
        (match) =>
          match.round === 2 &&
          match.matchNumber === Math.ceil(bye.matchNumber / 2),
      );
      if (!next || !bye.winnerId) continue;
      if (bye.matchNumber % 2 === 1) next.player1Id = bye.winnerId;
      else next.player2Id = bye.winnerId;
    }
    return matches;
  }
}
