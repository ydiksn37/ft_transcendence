import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateGameSettingsDto } from './dto/user.dto';

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async exportUserData(userId: string) {
    const [user, stats, settings, gameResultsP1, gameResultsP2, sprintRecords] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          // Keep this as an explicit allowlist. Authentication secrets such as
          // passwordHash and twoFactorSecret must never leave the server.
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            role: true,
            isOnline: true,
            lastSeenAt: true,
            bannedUntil: true,
            banReason: true,
            oauthProvider: true,
            oauthId: true,
            twoFactorEnabled: true,
            deletedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.userStats.findUnique({ where: { userId } }),
        this.prisma.userGameSettings.findUnique({ where: { userId } }),
        this.prisma.gameResult.findMany({ where: { player1Id: userId } }),
        this.prisma.gameResult.findMany({ where: { player2Id: userId } }),
        this.prisma.sprintRecord.findMany({ where: { userId } }),
      ]);

    // GDPR data export payload
    return {
      profile: user,
      stats,
      settings,
      matchHistory: [...gameResultsP1, ...gameResultsP2],
      sprintHistory: sprintRecords,
      exportedAt: new Date().toISOString(),
    };
  }

  async importUserSettings(
    userId: string,
    settingsData: UpdateGameSettingsDto,
  ) {
    const updateData = this.importableSettings(settingsData);
    if (Object.keys(updateData).length === 0) return null;

    const keyBindings = updateData.keyBindings === null ? Prisma.DbNull : updateData.keyBindings
      ? { ...updateData.keyBindings }
      : undefined;

    return this.prisma.userGameSettings.upsert({
      where: { userId },
      create: { userId, ...updateData, keyBindings },
      update: { ...updateData, keyBindings },
    });
  }

  private importableSettings(settings: UpdateGameSettingsDto) {
    const { touchFlick: _touchFlick, ...data } = settings;
    for (const [field, value] of Object.entries(data)) {
      if (value === null && field !== 'keyBindings') throw new BadRequestException(`${field} must not be null`);
    }
    return data;
  }

  async previewUserSettings(userId: string, settings: UpdateGameSettingsDto) {
    const data = this.importableSettings(settings);
    const current = await this.prisma.userGameSettings.findUnique({ where: { userId } });
    return {
      createsSettings: current === null,
      changes: Object.entries(data).filter(([, value]) => value !== undefined).map(([field, value]) => ({
        field, previous: current ? current[field as keyof typeof current] : null, next: value,
      })),
      note: 'Only these preferences will be updated. Account, rank, history and game rules are not imported.',
    };
  }
}
