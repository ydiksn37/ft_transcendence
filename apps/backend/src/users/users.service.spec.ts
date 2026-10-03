import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService admin operations', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    chatMessage: { deleteMany: jest.fn() },
    fileUpload: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.update.mockResolvedValue({ id: 'target-user' });
    prisma.user.delete.mockResolvedValue({ id: 'target-user' });
    prisma.chatMessage.deleteMany.mockResolvedValue({ count: 0 });
    prisma.fileUpload.deleteMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockResolvedValue([]);
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
    prisma.user.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN', bannedUntil: null })
      .mockResolvedValueOnce({ role: 'USER' });
    prisma.$transaction.mockImplementationOnce(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    await service.adminBanUser('admin-user', 'target-user', {
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
      service.adminBanUser('admin-user', 'target-user', {
        reason: 'reason',
        durationDays: 7,
        bannedUntil: '2099-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.adminBanUser('admin-user', 'target-user', {
        reason: 'reason',
        bannedUntil: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing friend or block target before a Prisma write', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.sendFriendRequest('requester', {
        addresseeId: '123e4567-e89b-12d3-a456-426614174000',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.blockUser('requester', '123e4567-e89b-12d3-a456-426614174000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires the current password before deleting an account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      displayName: 'Player',
      passwordHash: await bcrypt.hash('correct-password', 4),
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });

    await expect(
      service.deleteMe('user-1', {
        password: 'wrong-password',
        confirmation: 'DELETE MY ACCOUNT',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a valid TOTP code when two-factor authentication is enabled', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      displayName: 'Player',
      passwordHash: null,
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      fileUploads: [],
    });

    await expect(
      service.deleteMe('user-1', {
        confirmation: 'DELETE MY ACCOUNT',
        twoFactorCode: '000000',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('permanently deletes personal data after direct reauthentication', async () => {
    prisma.$transaction.mockImplementationOnce(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      displayName: 'Player',
      passwordHash: await bcrypt.hash('correct-password', 4),
      twoFactorEnabled: false,
      twoFactorSecret: null,
      fileUploads: [],
    });

    const result = await service.deleteMe('user-1', {
      confirmation: 'DELETE MY ACCOUNT',
      password: 'correct-password',
    });

    expect(prisma.chatMessage.deleteMany).toHaveBeenCalledWith({
      where: { senderId: 'user-1' },
    });
    expect(prisma.fileUpload.deleteMany).toHaveBeenCalledWith({
      where: { uploaderId: 'user-1' },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.message).toContain('完全に削除');
  });

  it('refuses GDPR deletion of the last usable administrator without deleting personal data', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-user',
      role: 'ADMIN',
      email: 'admin@example.com',
      displayName: 'Admin',
      passwordHash: await bcrypt.hash('correct-password', 4),
      twoFactorEnabled: false,
      twoFactorSecret: null,
      fileUploads: [],
    });
    prisma.user.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementationOnce(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    await expect(
      service.deleteMe('last-admin', {
        confirmation: 'DELETE MY ACCOUNT',
        password: 'correct-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatMessage.deleteMany).not.toHaveBeenCalled();
    expect(prisma.fileUpload.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('does not expose a deleted user through search or profile lookup', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.searchUsers({ q: 'deleted-player' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getUserById('deleted-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
