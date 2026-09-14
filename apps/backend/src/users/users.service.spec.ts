import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService admin operations', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.update.mockResolvedValue({ id: 'target-user' });
  });

  it('never returns authentication secrets from the current-user profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'player',
      passwordHash: 'hash',
      twoFactorSecret: 'secret',
    });

    const result = await service.getMe('user-1');

    expect(result).toEqual({ id: 'user-1', username: 'player' });
  });

  it('uses an explicit safe field selection for the admin user list', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.adminGetUsers(1, 50);

    const query = prisma.user.findMany.mock.calls[0][0];
    expect(query.select).toBeDefined();
    expect(query.select).not.toHaveProperty('passwordHash');
    expect(query.select).not.toHaveProperty('twoFactorSecret');
    expect(query.take).toBe(50);
  });

  it('converts durationDays to an absolute BAN expiry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-14T00:00:00.000Z'));

    await service.adminBanUser('target-user', {
      reason: 'Violation of terms',
      durationDays: 7,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          banReason: 'Violation of terms',
          bannedUntil: new Date('2026-09-21T00:00:00.000Z'),
        },
      }),
    );
    jest.useRealTimers();
  });

  it('rejects ambiguous or expired BAN periods', async () => {
    await expect(
      service.adminBanUser('target-user', {
        reason: 'reason',
        durationDays: 7,
        bannedUntil: '2099-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.adminBanUser('target-user', {
        reason: 'reason',
        bannedUntil: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
