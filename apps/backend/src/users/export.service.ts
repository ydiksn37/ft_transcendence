import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async exportUserData(userId: string) {
    const [user, stats, settings, gameResultsP1, gameResultsP2, sprintRecords] =
      await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        this.prisma.userStats.findUnique({ where: { userId } }),
        this.prisma.userGameSettings.findUnique({ where: { userId } }),
        this.prisma.gameResult.findMany({ where: { player1Id: userId } }),
        this.prisma.gameResult.findMany({ where: { player2Id: userId } }),
        this.prisma.sprintRecord.findMany({ where: { userId } }),
      ]);

    // GDPA Data Export Payload
    return {
      profile: user,
      stats,
      settings,
      matchHistory: [...gameResultsP1, ...gameResultsP2],
      sprintHistory: sprintRecords,
      exportedAt: new Date().toISOString(),
    };
  }

  async recordExportRequest(userId: string, data: any) {
    // In a real application, you might save the JSON to S3 and store the URL in DataExportRequest.
    // For now, we will create a record and return the data directly.
    await this.prisma.dataExportRequest.create({
      data: {
        userId,
        status: 'READY',
        processedAt: new Date(),
      },
    });
    return data;
  }
}
