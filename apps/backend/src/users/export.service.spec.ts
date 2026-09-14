import { PrismaService } from '../prisma/prisma.service';
import { ExportService } from './export.service';

describe('ExportService', () => {
  const userId = 'user-1';
  const profile = {
    id: userId,
    email: 'player@example.com',
    username: 'player',
    displayName: 'Player',
    avatarUrl: null,
    bio: null,
    role: 'USER',
    isOnline: false,
    lastSeenAt: null,
    bannedUntil: null,
    banReason: null,
    oauthProvider: null,
    oauthId: null,
    twoFactorEnabled: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  const prisma = {
    user: { findUnique: jest.fn() },
    userStats: { findUnique: jest.fn() },
    userGameSettings: { findUnique: jest.fn() },
    gameResult: { findMany: jest.fn() },
    sprintRecord: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(profile);
    prisma.userStats.findUnique.mockResolvedValue(null);
    prisma.userGameSettings.findUnique.mockResolvedValue(null);
    prisma.gameResult.findMany.mockResolvedValue([]);
    prisma.sprintRecord.findMany.mockResolvedValue([]);
  });

  it('exports only explicitly allowed profile fields', async () => {
    const service = new ExportService(prisma as unknown as PrismaService);

    const result = await service.exportUserData(userId);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: userId },
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
    });
    expect(result.profile).toEqual(profile);
    expect(result.profile).not.toHaveProperty('passwordHash');
    expect(result.profile).not.toHaveProperty('twoFactorSecret');
  });

  it('does not persist frontend-only settings during import', async () => {
    const service = new ExportService(prisma as unknown as PrismaService);
    const upsert = jest.fn().mockResolvedValue({ volume: 75 });
    Object.assign(prisma, {
      userGameSettings: { findUnique: jest.fn(), upsert },
    });

    await service.importUserSettings(userId, {
      volume: 75,
      touchFlick: true,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { userId },
      create: { userId, volume: 75, keyBindings: undefined },
      update: { volume: 75, keyBindings: undefined },
    });
  });
});
