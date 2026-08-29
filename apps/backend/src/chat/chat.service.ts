import { Injectable, OnModuleInit } from '@nestjs/common';
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

  async getUserRooms(userId: string) {
    const globalRoom = await this.prisma.chatRoom.findFirst({
      where: { type: 'GLOBAL' },
    });

    const memberships = await this.prisma.chatRoomMembership.findMany({
      where: { userId },
      include: { room: true },
    });
    const rooms = memberships.map((m: any) => m.room);

    if (globalRoom && !rooms.some((r: any) => r.id === globalRoom.id)) {
      rooms.unshift(globalRoom);
    }
    return rooms;
  }

  async getMessages(roomId: string) {
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
