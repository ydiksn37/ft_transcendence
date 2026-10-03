import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCreateUserDto, AdminEditUserDto } from './dto/user.dto';

describe('admin user creation and profile edits', () => {
  const findUnique = jest.fn(),
    create = jest.fn(),
    update = jest.fn();
  const tx = { user: { findUnique, create, update } };
  const transaction = jest.fn(async (fn: (client: typeof tx) => unknown) =>
    fn(tx),
  );
  const service = new UsersService({
    $transaction: transaction,
  } as unknown as PrismaService);
  const dto = {
    email: 'new@example.com',
    username: 'new_user',
    displayName: 'New User',
    password: 'StrongPassword123!',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({ role: 'ADMIN', bannedUntil: null });
    create.mockResolvedValue({ id: 'new-user' });
  });

  it('creates USER with hashed password, initial stats/settings and a safe response select', async () => {
    await service.adminCreateUser('admin', {
      ...dto,
      role: 'ADMIN',
    } as AdminCreateUserDto);
    const args = create.mock.calls[0][0];
    expect(args.data).toMatchObject({
      role: 'USER',
      stats: { create: {} },
      gameSettings: { create: {} },
    });
    expect(await bcrypt.compare(dto.password, args.data.passwordHash)).toBe(
      true,
    );
    expect(args.data).not.toHaveProperty('password');
    expect(args.select).not.toHaveProperty('passwordHash');
    expect(args.select).not.toHaveProperty('twoFactorSecret');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin', deletedAt: null } }),
    );
  });

  it.each(['USER', 'MODERATOR', 'GUEST'])(
    'rejects stale/non-admin %s authority inside the transaction',
    async (role) => {
      findUnique.mockResolvedValue({ role, bannedUntil: null });
      await expect(
        service.adminCreateUser('actor', dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('maps duplicate users to 409', async () => {
    create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.12.0',
      }),
    );
    await expect(service.adminCreateUser('admin', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('edits only explicit profile fields and retains authorization checks', async () => {
    await service.adminEditUser('admin', 'target', {
      displayName: 'Updated',
      bio: 'Hello',
      role: 'ADMIN',
    } as AdminEditUserDto);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target' },
        data: { displayName: 'Updated', bio: 'Hello' },
      }),
    );
    await expect(
      service.adminEditUser('admin', 'admin', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects privilege/credential fields at the DTO boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        { ...dto, role: 'ADMIN' },
        { type: 'body', metatype: AdminCreateUserDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { password: 'replace', twoFactorSecret: 'secret' },
        { type: 'body', metatype: AdminEditUserDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
