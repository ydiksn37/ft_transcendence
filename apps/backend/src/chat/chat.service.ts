import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const globalRoom = await this.prisma.chatRoom.findFirst({
      where: { type: 'GLOBAL' },
    });
    if (!globalRoom) {
      await this.prisma.chatRoom.create({
        data: {
          type: 'GLOBAL',
          name: 'GLOBAL_ROOM',
        },
      });
    }
  }

  async getOrCreateDirectRoom(userId1: string, userId2: string) {
    if (userId1 === userId2)
      throw new BadRequestException('自分自身とのチャットは作成できません');

    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId2, deletedAt: null },
      select: { id: true },
    });
    if (!targetUser) {
      throw new NotFoundException('対象ユーザーが見つかりません');
    }

    const existingRooms = await this.prisma.chatRoom.findMany({
      where: { type: 'DIRECT' },
      include: { memberships: true },
    });

    const room = existingRooms.find(
      (r) =>
        r.memberships.some((m) => m.userId === userId1) &&
        r.memberships.some((m) => m.userId === userId2),
    );

    if (room) return room;

    return this.prisma.chatRoom.create({
      data: {
        type: 'DIRECT',
        memberships: {
          create: [{ userId: userId1 }, { userId: userId2 }],
        },
      },
      include: { memberships: true },
    });
  }

  async getUserRooms(userId: string) {
    const globalRoom = await this.prisma.chatRoom.findFirst({
      where: { type: 'GLOBAL' },
    });

    const memberships = await this.prisma.chatRoomMembership.findMany({
      where: { userId },
      include: {
        room: {
          include: {
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const rooms = memberships.map((m: any) => m.room);

    if (globalRoom && !rooms.some((r: any) => r.id === globalRoom.id)) {
      rooms.unshift(globalRoom);
    }
    return rooms;
  }

  async assertCanAccessRoom(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        type: true,
        memberships: {
          where: { userId },
          select: { id: true },
        },
      },
    });

    if (!room) throw new NotFoundException('チャットルームが見つかりません');
    if (room.type !== 'GLOBAL' && room.memberships.length === 0) {
      throw new ForbiddenException(
        'このチャットルームへのアクセス権がありません',
      );
    }
    return room;
  }

  async getMessages(roomId: string, userId: string) {
    await this.assertCanAccessRoom(roomId, userId);
    return this.prisma.chatMessage.findMany({
      where: { roomId },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async saveMessage(roomId: string, senderId: string, content: string) {
    await this.assertCanAccessRoom(roomId, senderId);
    return this.prisma.chatMessage.create({
      data: {
        roomId,
        senderId,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }
}
