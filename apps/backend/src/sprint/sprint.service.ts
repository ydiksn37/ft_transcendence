import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveSprintDto } from './dto/save-sprint.dto';

@Injectable()
export class SprintService {
  constructor(private prisma: PrismaService) {}

  async saveRecord(userId: string, dto: SaveSprintDto) {
    return this.prisma.sprintRecord.create({
      data: {
        userId,
        timeMs: dto.timeMs,
        lines: dto.lines ?? 40,
        pieces: dto.pieces,
      },
    });
  }

  async getGlobalLeaderboard(limit = 10) {
    const records = await this.prisma.sprintRecord.findMany({
      where: { lines: 40 },
      orderBy: { timeMs: 'asc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isOnline: true,
            role: true,
          },
        },
      },
    });

    return records.map((record: any, index: any) => ({
      rank: index + 1,
      record: {
        id: record.id,
        userId: record.userId,
        timeMs: record.timeMs,
        lines: record.lines,
        pieces: record.pieces,
        createdAt: record.createdAt.toISOString(),
      },
      user: record.user,
    }));
  }

  async getMyRecords(userId: string, limit = 10) {
    const records = await this.prisma.sprintRecord.findMany({
      where: { userId, lines: 40 },
      orderBy: { timeMs: 'asc' },
      take: limit,
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
    });

    return records.map((record: any, index: any) => ({
      rank: index + 1,
      record: {
        id: record.id,
        userId: record.userId,
        timeMs: record.timeMs,
        lines: record.lines,
        pieces: record.pieces,
        createdAt: record.createdAt.toISOString(),
        user: record.user,
      },
    }));
  }
}
