import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto, SearchUsersDto, BanUserDto, SearchHistoryDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 自分のプロフィール取得 ────────────────────────────────
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: { stats: true, gameSettings: true },
    });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');
    return this.sanitizeUser(user);
  }

  // ── プロフィール更新 ──────────────────────────────────────
  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    return this.sanitizeUser(user);
  }

  // ── ゲーム設定更新 ──────────────────────────────────────
  async updateGameSettings(userId: string, data: any) {
    const { touchFlick, ...safeData } = data; // touchFlickを除外
    return this.prisma.userGameSettings.upsert({
      where: {
        userId,
      },
      update: {
        ...safeData,
        keyBindings: safeData.keyBindings ? safeData.keyBindings : undefined,
      },
      create: {
        userId,
        ...safeData,
        keyBindings: safeData.keyBindings ? safeData.keyBindings : undefined,
      },
    });
  }

  // ── アカウント削除（ソフトデリート） ───────────────────
  async deleteMe(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
    return { message: 'アカウントを削除しました' };
  }

  // ── アバター更新 ───────────────────────────────────────────
  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    return { avatarUrl: user.avatarUrl };
  }

  // ── 他ユーザープロフィール取得 ────────────────────────────
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      include: { stats: true },
    });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');
    return this.sanitizePublicUser(user);
  }

  // ── ユーザー検索 ──────────────────────────────────────────
  async searchUsers(dto: SearchUsersDto) {
    const page = Number(dto.page ?? 1);
    const limit = Math.min(Number(dto.limit ?? 20), 50);
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (dto.q) {
      where.OR = [
        { username: { contains: dto.q, mode: 'insensitive' } },
        { displayName: { contains: dto.q, mode: 'insensitive' } },
      ];
    }

    if (dto.status === 'ONLINE') {
      where.isOnline = true;
    } else if (dto.status === 'OFFLINE') {
      where.isOnline = false;
    }

    let orderBy: any = { stats: { rankPoints: 'desc' } };
    if (dto.sortBy === 'WIN_RATE_DESC') orderBy = { stats: { winRate: 'desc' } };
    else if (dto.sortBy === 'WIN_RATE_ASC') orderBy = { stats: { winRate: 'asc' } };
    else if (dto.sortBy === 'GAMES_DESC') orderBy = { stats: { totalGames: 'desc' } };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isOnline: true,
          role: true,
          stats: { select: { rank: true, rankPoints: true, winRate: true, totalGames: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── ゲーム統計取得 ────────────────────────────────────────
  async getUserStats(id: string) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId: id },
    });
    if (!stats) throw new NotFoundException('統計データが見つかりません');
    return stats;
  }

  // ── 対戦履歴取得 ──────────────────────────────────────────
  async getGameHistory(userId: string, dto: SearchHistoryDto) {
    const page = Number(dto.page ?? 1);
    const limit = Math.min(Number(dto.limit ?? 20), 50);
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [{ player1Id: userId }, { player2Id: userId }],
    };

    if (dto.mode && dto.mode !== 'ALL') {
      where.gameMode = dto.mode;
    }

    if (dto.result === 'WIN') {
      where.winnerId = userId;
    } else if (dto.result === 'LOSE') {
      where.winnerId = { not: userId };
    }

    const [results, total] = await Promise.all([
      this.prisma.gameResult.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          player1: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          player2: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          winner: { select: { id: true, username: true } },
        },
      }),
      this.prisma.gameResult.count({ where }),
    ]);

    return {
      data: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── フレンド申請 ──────────────────────────────────────────
  async sendFriendRequest(
    requesterId: string,
    dto: { addresseeId?: string; username?: string },
  ) {
    let addresseeId = dto.addresseeId;
    if (!addresseeId && dto.username) {
      const uname = dto.username.startsWith('@')
        ? dto.username.substring(1)
        : dto.username;
      const targetUser = await this.prisma.user.findUnique({
        where: { username: uname },
      });
      if (!targetUser)
        throw new NotFoundException('指定されたユーザーが見つかりません');
      addresseeId = targetUser.id;
    }
    if (!addresseeId) {
      throw new BadRequestException('addresseeIdまたはusernameが必要です');
    }

    if (requesterId === addresseeId) {
      throw new BadRequestException('自分にフレンド申請はできません');
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        status: { in: ['PENDING', 'ACCEPTED'] },
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('既にフレンド関係または申請中です');
    }

    // もし過去に拒否された(REJECTED)レコードがあれば削除して新しく作る
    await this.prisma.friendship.deleteMany({
      where: {
        status: 'REJECTED',
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });

    return this.prisma.friendship.create({
      data: { requesterId, addresseeId, status: 'PENDING' },
    });
  }

  // ── フレンド申請応答 ──────────────────────────────────────
  async respondFriendRequest(
    userId: string,
    friendshipId: string,
    accept: boolean,
  ) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship || friendship.addresseeId !== userId) {
      throw new ForbiddenException('この申請を操作する権限がありません');
    }

    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: accept ? 'ACCEPTED' : 'REJECTED' },
    });
  }

  // ── フレンド一覧取得 ──────────────────────────────────────
  async getFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: { in: ['ACCEPTED', 'PENDING'] } },
          { addresseeId: userId, status: { in: ['ACCEPTED', 'PENDING'] } },
        ],
      },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isOnline: true,
          },
        },
        addressee: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isOnline: true,
          },
        },
      },
    });

    return friendships;
  }

  // ── フレンド削除 ──────────────────────────────────────────
  async removeFriend(userId: string, friendId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: userId },
        ],
      },
    });

    if (!friendship)
      throw new NotFoundException('フレンド関係が見つかりません');
    await this.prisma.friendship.delete({ where: { id: friendship.id } });
    return { message: 'フレンドを削除しました' };
  }

  // ── ブロック ───────────────────────────────────────────────
  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId)
      throw new BadRequestException('自分をブロックできません');

    const existing = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (existing) throw new BadRequestException('既にブロック済みです');

    return this.prisma.block.create({ data: { blockerId, blockedId } });
  }

  // ── ブロック解除 ──────────────────────────────────────────
  async unblockUser(blockerId: string, blockedId: string) {
    const block = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (!block) throw new NotFoundException('ブロック関係が見つかりません');

    await this.prisma.block.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    return { message: 'ブロックを解除しました' };
  }

  // ── [ADMIN] 全ユーザー一覧 ────────────────────────────────
  async adminGetUsers(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── [ADMIN] ロール変更 ────────────────────────────────────
  async adminUpdateRole(targetId: string, role: any) {
    return this.prisma.user.update({
      where: { id: targetId },
      data: { role },
    });
  }

  // ── [ADMIN/MOD] BAN ────────────────────────────────────────
  async adminBanUser(targetId: string, dto: BanUserDto) {
    return this.prisma.user.update({
      where: { id: targetId },
      data: {
        bannedUntil: dto.bannedUntil
          ? new Date(dto.bannedUntil)
          : new Date('9999-12-31'),
        banReason: dto.reason,
      },
    });
  }

  // ── [ADMIN] BAN解除 ────────────────────────────────────────
  async adminUnbanUser(targetId: string) {
    return this.prisma.user.update({
      where: { id: targetId },
      data: { bannedUntil: null, banReason: null },
    });
  }

  // ── ユーザー情報サニタイズ ────────────────────────────────
  private sanitizeUser(user: any) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  private sanitizePublicUser(user: any) {
    const {
      passwordHash,
      email,
      oauthId,
      bannedUntil,
      banReason,
      deletedAt,
      ...publicUser
    } = user;
    return publicUser;
  }
}
