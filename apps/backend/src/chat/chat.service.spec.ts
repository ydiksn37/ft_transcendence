import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

describe('ChatService direct room validation', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    chatRoom: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    chatMessage: { findMany: jest.fn(), create: jest.fn() },
  };
  const service = new ChatService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a direct room with oneself', async () => {
    await expect(
      service.getOrCreateDirectRoom('user-1', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 semantics instead of a Prisma foreign-key error', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.getOrCreateDirectRoom('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.chatRoom.create).not.toHaveBeenCalled();
  });

  it('allows every authenticated user to access the global room', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue({
      id: 'global-room',
      type: 'GLOBAL',
      memberships: [],
    });
    prisma.chatMessage.findMany.mockResolvedValue([]);

    await expect(service.getMessages('global-room', 'user-1')).resolves.toEqual(
      [],
    );
  });

  it('allows a member to access a private room', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue({
      id: 'direct-room',
      type: 'DIRECT',
      memberships: [{ id: 'membership-1' }],
    });
    prisma.chatMessage.findMany.mockResolvedValue([]);

    await expect(service.getMessages('direct-room', 'user-1')).resolves.toEqual(
      [],
    );
  });

  it('rejects reads and writes by a non-member', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue({
      id: 'direct-room',
      type: 'DIRECT',
      memberships: [],
    });

    await expect(
      service.getMessages('direct-room', 'intruder'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.saveMessage('direct-room', 'intruder', 'secret'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown room', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue(null);

    await expect(
      service.getMessages('missing-room', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
