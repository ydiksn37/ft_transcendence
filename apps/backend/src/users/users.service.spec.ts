import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
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

  const redis = {
    setEx: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const mail = {
    sendAccountDeletionCode: jest.fn(),
    sendAccountDeleted: jest.fn(),
  };

  const service = new UsersService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    mail as unknown as MailService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.update.mockResolvedValue({ id: 'target-user' });
    prisma.user.delete.mockResolvedValue({ id: 'target-user' });
    prisma.chatMessage.deleteMany.mockResolvedValue({ count: 0 });
    prisma.fileUpload.deleteMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockResolvedValue([]);
    redis.del.mockResolvedValue(undefined);
    mail.sendAccountDeletionCode.mockResolvedValue(undefined);
    mail.sendAccountDeleted.mockResolvedValue(undefined);
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

  it('requires the current password before emailing a deletion code', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      displayName: 'Player',
      passwordHash: await bcrypt.hash('correct-password', 4),
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });

    await expect(
      service.requestAccountDeletion('user-1', {
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.setEx).not.toHaveBeenCalled();
    expect(mail.sendAccountDeletionCode).not.toHaveBeenCalled();
  });

  it('emails a short-lived deletion code after identity verification', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      displayName: 'Player',
      passwordHash: await bcrypt.hash('correct-password', 4),
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });

    const result = await service.requestAccountDeletion('user-1', {
      password: 'correct-password',
    });

    expect(redis.setEx).toHaveBeenCalledWith(
      'account-deletion:user-1',
      600,
      expect.any(String),
    );
    expect(mail.sendAccountDeletionCode).toHaveBeenCalledWith(
      'player@example.com',
      'Player',
      expect.stringMatching(/^\d{6}$/),
      10,
    );
    expect(result.expiresInSeconds).toBe(600);
  });

  it('rejects deletion without a valid emailed code', async () => {
    redis.get.mockResolvedValue(await bcrypt.hash('123456', 4));

    await expect(
      service.deleteMe('user-1', {
        confirmation: 'DELETE MY ACCOUNT',
        code: '999999',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('permanently deletes personal data and sends completion email', async () => {
    prisma.$transaction.mockImplementationOnce(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    redis.get.mockResolvedValue(await bcrypt.hash('123456', 4));
    prisma.user.findUnique.mockResolvedValue({
      email: 'player@example.com',
      displayName: 'Player',
      fileUploads: [],
    });

    const result = await service.deleteMe('user-1', {
      confirmation: 'DELETE MY ACCOUNT',
      code: '123456',
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
    expect(redis.del).toHaveBeenCalledWith('account-deletion:user-1');
    expect(mail.sendAccountDeleted).toHaveBeenCalledWith(
      'player@example.com',
      'Player',
    );
    expect(result.message).toContain('完全に削除');
  });

  it('refuses GDPR deletion of the last usable administrator without deleting personal data', async () => {
    redis.get.mockResolvedValue(await bcrypt.hash('123456', 4));
    prisma.user.findUnique.mockResolvedValue({
      role: 'ADMIN',
      email: 'admin@example.com',
      displayName: 'Admin',
      fileUploads: [],
    });
    prisma.user.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementationOnce(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    await expect(
      service.deleteMe('last-admin', {
        confirmation: 'DELETE MY ACCOUNT',
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatMessage.deleteMany).not.toHaveBeenCalled();
    expect(prisma.fileUpload.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(mail.sendAccountDeleted).not.toHaveBeenCalled();
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
