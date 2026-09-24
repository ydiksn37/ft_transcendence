import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';

describe('admin account deletion', () => {
  const findUnique = jest.fn(), remove = jest.fn(), count = jest.fn();
  const chatDelete = jest.fn(), uploadDelete = jest.fn(), del = jest.fn(), sendAccountDeleted = jest.fn();
  const tx = { user: { findUnique, delete: remove, count }, chatMessage: { deleteMany: chatDelete }, fileUpload: { deleteMany: uploadDelete } };
  const transaction = jest.fn(async fn => fn(tx));
  const service = new UsersService({ $transaction: transaction } as unknown as PrismaService, { del } as unknown as RedisService, { sendAccountDeleted } as unknown as MailService);
  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockImplementation(async ({ where }) => where.id === 'actor'
      ? { role: 'ADMIN', bannedUntil: null }
      : { role: 'USER', email: 'target@example.com', displayName: 'Target', fileUploads: [] });
    count.mockResolvedValue(1);
  });
  it('deletes only the target and uses the shared post-deletion cleanup', async () => {
    await service.adminDeleteUser('actor', 'target', 'DELETE USER');
    expect(remove).toHaveBeenCalledWith({ where: { id: 'target' } });
    expect(chatDelete).toHaveBeenCalledWith({ where: { senderId: 'target' } });
    expect(uploadDelete).toHaveBeenCalledWith({ where: { uploaderId: 'target' } });
    expect(del).toHaveBeenCalledWith('account-deletion:target');
    expect(sendAccountDeleted).toHaveBeenCalledWith('target@example.com', 'Target');
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('requires explicit confirmation and prevents self deletion', async () => {
    await expect(service.adminDeleteUser('actor', 'target', '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.adminDeleteUser('actor', 'actor', 'DELETE USER')).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([null, { role: 'MODERATOR' }, { role: 'USER' }, { role: 'ADMIN', bannedUntil: new Date('2999-01-01') }])('rejects inactive/non-admin actors %j', async actor => {
    findUnique.mockResolvedValueOnce(actor);
    await expect(service.adminDeleteUser('actor', 'target', 'DELETE USER')).rejects.toBeInstanceOf(ForbiddenException);
    expect(remove).not.toHaveBeenCalled();
  });
  it('rejects a missing target', async () => {
    findUnique.mockResolvedValueOnce({ role: 'ADMIN' }).mockResolvedValueOnce(null);
    await expect(service.adminDeleteUser('actor', 'target', 'DELETE USER')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('protects the last effective administrator', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN', fileUploads: [] });
    count.mockResolvedValue(0);
    await expect(service.adminDeleteUser('actor', 'target', 'DELETE USER')).rejects.toBeInstanceOf(ForbiddenException);
    expect(remove).not.toHaveBeenCalled();
  });
});
