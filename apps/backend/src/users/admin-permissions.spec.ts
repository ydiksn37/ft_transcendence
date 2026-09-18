import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';

describe('administrative permission hierarchy', () => {
  const user = { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() };
  const transaction = jest.fn();
  const service = new UsersService(
    { $transaction: transaction } as unknown as PrismaService,
    {} as RedisService, {} as MailService,
  );
  const conflict = () => new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034', clientVersion: '6.12.0',
  });
  beforeEach(() => {
    jest.resetAllMocks();
    user.update.mockResolvedValue({ id: 'target' });
    user.count.mockResolvedValue(1);
    transaction.mockImplementation(callback => callback({ user }));
  });
  const roles = (actor: string, target: string) => {
    user.findUnique.mockResolvedValueOnce({ role: actor, bannedUntil: null })
      .mockResolvedValueOnce({ role: target });
  };

  it.each(['ADMIN', 'MODERATOR'])('moderators cannot ban/unban %s', async role => {
    for (const unban of [false, true]) {
      roles('MODERATOR', role);
      await expect(unban ? service.adminUnbanUser('actor', 'target') :
        service.adminBanUser('actor', 'target', { reason: 'test' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(user.update).not.toHaveBeenCalled();
  });

  it.each(['USER', 'GUEST'])('moderators may ban and unban %s', async role => {
    roles('MODERATOR', role);
    await service.adminBanUser('actor', 'target', { reason: 'test' });
    roles('MODERATOR', role);
    await service.adminUnbanUser('actor', 'target');
    expect(user.update).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(user.update.mock.calls[0][0].select).not.toHaveProperty('passwordHash');
  });

  it('rejects all self-management operations before writing', async () => {
    for (const operation of [
      () => service.adminBanUser('me', 'me', { reason: 'test' }),
      () => service.adminUnbanUser('me', 'me'),
      () => service.adminUpdateRole('me', 'me', 'USER'),
    ]) await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['MODERATOR', 'USER', 'GUEST'])('denies role changes by %s', async role => {
    roles(role, 'USER');
    await expect(service.adminUpdateRole('actor', 'target', 'ADMIN'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(user.update).not.toHaveBeenCalled();
  });

  it('uses current database privileges, rejecting banned or deleted actors', async () => {
    for (const actor of [null, { role: 'ADMIN', bannedUntil: new Date('9999-01-01') }]) {
      user.findUnique.mockResolvedValueOnce(actor);
      await expect(service.adminUnbanUser('actor', 'target')).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(user.update).not.toHaveBeenCalled();
  });

  it('rejects deleted or missing targets', async () => {
    user.findUnique.mockResolvedValueOnce({ role: 'ADMIN', bannedUntil: null }).mockResolvedValueOnce(null);
    await expect(service.adminUpdateRole('actor', 'target', 'USER')).rejects.toBeInstanceOf(NotFoundException);
    expect(user.update).not.toHaveBeenCalled();
  });

  it('protects the last usable administrator from demotion and ban', async () => {
    user.count.mockResolvedValue(0);
    roles('ADMIN', 'ADMIN');
    await expect(service.adminUpdateRole('actor', 'target', 'USER')).rejects.toBeInstanceOf(ForbiddenException);
    roles('ADMIN', 'ADMIN');
    await expect(service.adminBanUser('actor', 'target', { reason: 'test' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(user.update).not.toHaveBeenCalled();
    expect(user.count.mock.calls[0][0].where).toEqual(expect.objectContaining({
      id: { not: 'target' }, role: 'ADMIN', deletedAt: null,
    }));
  });

  it('permits an administrator to demote another when a usable administrator remains', async () => {
    roles('ADMIN', 'ADMIN');
    await service.adminUpdateRole('actor', 'target', 'USER');
    expect(user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'USER' } }));
  });

  it('rechecks authorization when retrying a serialization conflict', async () => {
    transaction.mockRejectedValueOnce(conflict());
    roles('USER', 'ADMIN');
    await expect(service.adminUpdateRole('actor', 'target', 'USER')).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(user.update).not.toHaveBeenCalled();
  });

  it('bounds conflict retries and returns a retryable HTTP 409', async () => {
    transaction.mockRejectedValue(conflict());
    await expect(service.adminUnbanUser('actor', 'target')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
