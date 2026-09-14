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

  async importUserSettings(userId: string, settingsData: any) {
    if (!settingsData) return null;

    // Whitelist the settings to update
    const allowedKeys = [
      'minoSkin',
      'showGhost',
      'arr',
      'das',
      'dcd',
      'sdf',
      'keyBindings',
      'volume',
      'sfxEnabled',
      'musicEnabled',
    ];
    const updateData: any = {};
    for (const key of allowedKeys) {
      if (settingsData[key] !== undefined) {
        updateData[key] = settingsData[key];
      }
    }

    if (Object.keys(updateData).length === 0) return null;

    return this.prisma.userGameSettings.upsert({
      where: { userId },
      create: { userId, ...updateData },
      update: updateData,
    });
  }
}
