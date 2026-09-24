import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GAME_ACHIEVEMENTS } from '../game/achievements';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { unlink } from 'fs/promises';
import { basename, join, resolve, sep } from 'path';
import { authenticator } from 'otplib';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import {
  UpdateUserDto,
  AdminCreateUserDto,
  AdminEditUserDto,
  SearchUsersDto,
  BanUserDto,
  SearchHistoryDto,
  UpdateGameSettingsDto,
  RequestAccountDeletionDto,
  ConfirmAccountDeletionDto,
} from './dto/user.dto';

const ACCOUNT_DELETION_TTL_SECONDS = 10 * 60;
const ACCOUNT_DELETION_CONFIRMATION = 'DELETE MY ACCOUNT';

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  role: true,
  isOnline: true,
  lastSeenAt: true,
  bannedUntil: true,
  banReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  // ── 自分のプロフィール取得 ────────────────────────────────
  async getProgression(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        stats: { select: { xp: true, level: true, rank: true, rankPoints: true, wins: true, totalGames: true, totalTSpins: true, totalTetrises: true } },
        achievements: { select: { earnedAt: true, achievement: { select: { key: true, xpReward: true } } } },
      },
    });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');
    const stats = user.stats;
    const xp = stats?.xp ?? 0;
    return {
      xp, level: stats?.level ?? 1, levelProgress: xp % 1000, levelTarget: 1000,
      rank: stats?.rank ?? 'BRONZE', rankPoints: stats?.rankPoints ?? 0,
      achievements: GAME_ACHIEVEMENTS.map(item => {
        const earned = user.achievements.find(entry => entry.achievement.key === item.key);
        return {
          key: item.key, name: item.name, description: item.description,
          target: item.target, progress: Math.min(item.target, stats?.[item.metric] ?? 0),
          xpReward: earned?.achievement.xpReward ?? item.xpReward,
          earnedAt: earned?.earnedAt ?? null,
        };
      }),
    };
  }

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
  async updateGameSettings(userId: string, dto: UpdateGameSettingsDto) {
    const { touchFlick: _touchFlick, ...settings } = dto;
    return this.prisma.userGameSettings.upsert({
      where: {
        userId,
      },
      update: {
        ...settings,
        keyBindings: settings.keyBindings
          ? { ...settings.keyBindings }
          : undefined,
      },
      create: {
        userId,
        ...settings,
        keyBindings: settings.keyBindings
          ? { ...settings.keyBindings }
          : undefined,
      },
    });
  }

  // ── GDPRアカウント完全削除 ────────────────────────────────
  async requestAccountDeletion(userId: string, dto: RequestAccountDeletionDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');

    if (user.passwordHash) {
      if (!dto.password) {
        throw new UnauthorizedException('現在のパスワードが必要です');
      }
      if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
        throw new UnauthorizedException('パスワードが正しくありません');
      }
    }

    if (user.twoFactorEnabled) {
      if (!user.twoFactorSecret || !dto.twoFactorCode) {
        throw new UnauthorizedException('2FAコードが必要です');
      }
      const valid = authenticator.verify({
        token: dto.twoFactorCode,
        secret: user.twoFactorSecret,
      });
      if (!valid) throw new UnauthorizedException('2FAコードが無効です');
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const redisKey = this.accountDeletionKey(userId);
    await this.redis.setEx(redisKey, ACCOUNT_DELETION_TTL_SECONDS, codeHash);

    try {
      await this.mail.sendAccountDeletionCode(
        user.email,
        user.displayName,
        code,
        ACCOUNT_DELETION_TTL_SECONDS / 60,
      );
    } catch (error) {
      await this.redis.del(redisKey);
      throw error;
    }

    return {
      message: '削除確認コードをメールで送信しました',
      expiresInSeconds: ACCOUNT_DELETION_TTL_SECONDS,
    };
  }

  async deleteMe(userId: string, dto: ConfirmAccountDeletionDto) {
    if (dto.confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
      throw new BadRequestException('確認文言が一致しません');
    }

    const redisKey = this.accountDeletionKey(userId);
    const codeHash = await this.redis.get(redisKey);
    if (!codeHash || !(await bcrypt.compare(dto.code, codeHash))) {
      throw new UnauthorizedException('削除確認コードが無効か期限切れです');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        email: true,
        displayName: true,
        fileUploads: { select: { storageUrl: true } },
      },
    });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');

    // Match/tournament history is retained with user references set to NULL.
    // Messages and all account-owned records are removed because their content
    // can contain personal data. Remaining user relations cascade or SetNull
    // according to schema.prisma.
    await this.withSerializableUserWrite(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: { role: true },
      });
      if (!current) throw new NotFoundException('ユーザーが見つかりません');
      if (current.role === 'ADMIN') await this.requireAnotherAdmin(tx, userId);
      await tx.chatMessage.deleteMany({ where: { senderId: userId } });
      await tx.fileUpload.deleteMany({ where: { uploaderId: userId } });
      await tx.user.delete({ where: { id: userId } });
    });
    return this.finishAccountDeletion(userId, user);
  }

  private async finishAccountDeletion(userId: string, user: {
    email: string; displayName: string; fileUploads: { storageUrl: string | null }[];
  }) {
    await this.redis.del(this.accountDeletionKey(userId));

    const localFiles = user.fileUploads
      .map((upload) => upload.storageUrl)
      .map((url) => this.localUploadPath(url))
      .filter((path): path is string => path !== null);
    const deletionResults = await Promise.allSettled(
      [...new Set(localFiles)].map((path) => unlink(path)),
    );
    if (deletionResults.some((result) => result.status === 'rejected')) {
      this.logger.warn(
        'アカウント削除後に一部のアップロードファイルを削除できませんでした',
      );
    }

    try {
      await this.mail.sendAccountDeleted(user.email, user.displayName);
    } catch (error) {
      this.logger.error(
        'アカウント削除完了メールを送信できませんでした',
        error instanceof Error ? error.stack : undefined,
      );
    }

    return { message: 'アカウントと個人データを完全に削除しました' };
  }

  private accountDeletionKey(userId: string): string {
    return `account-deletion:${userId}`;
  }

  private localUploadPath(storageUrl: string | null): string | null {
    if (!storageUrl || !storageUrl.startsWith('/uploads/')) return null;

    const uploadRoot = resolve(
      process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
    );
    const candidate = resolve(uploadRoot, basename(storageUrl));
    if (!candidate.startsWith(`${uploadRoot}${sep}`)) return null;
    return candidate;
  }

  // ── アバター更新 ───────────────────────────────────────────
  async updateAvatar(
    userId: string,
    avatarUrl: string,
    file: {
      filename: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
      }),
      this.prisma.fileUpload.create({
        data: {
          uploaderId: userId,
          filename: file.filename,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: BigInt(file.sizeBytes),
          storageUrl: avatarUrl,
          purpose: 'AVATAR',
          isPublic: true,
        },
      }),
    ]);
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

    let orderBy: Prisma.UserOrderByWithRelationInput = { stats: { rankPoints: 'desc' } };
    if (dto.sortBy === 'WIN_RATE_DESC')
      orderBy = { stats: { winRate: 'desc' } };
    else if (dto.sortBy === 'WIN_RATE_ASC')
      orderBy = { stats: { winRate: 'asc' } };
    else if (dto.sortBy === 'GAMES_DESC')
      orderBy = { stats: { totalGames: 'desc' } };

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
          stats: {
            select: {
              rank: true,
              rankPoints: true,
              winRate: true,
              totalGames: true,
            },
          },
        },
        orderBy: [orderBy, { id: 'asc' }],
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
    if (dto.from && dto.to && dto.from > dto.to) throw new BadRequestException('from must not be after to');
    const page = Number(dto.page ?? 1);
    const limit = Math.min(Number(dto.limit ?? 20), 50);
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [{ player1Id: userId }, { player2Id: userId }],
    };
    if (dto.from || dto.to) {
      const end = dto.to ? new Date(`${dto.to}T00:00:00.000Z`) : null;
      end?.setUTCDate(end.getUTCDate() + 1);
      where.createdAt = {
        ...(dto.from ? { gte: new Date(`${dto.from}T00:00:00.000Z`) } : {}),
        ...(end ? { lt: end } : {}),
      };
    }

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
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          player2: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
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

    const addressee = await this.prisma.user.findUnique({
      where: { id: addresseeId, deletedAt: null },
      select: { id: true },
    });
    if (!addressee) {
      throw new NotFoundException('指定されたユーザーが見つかりません');
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

    const target = await this.prisma.user.findUnique({
      where: { id: blockedId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('ユーザーが見つかりません');

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
        select: ADMIN_USER_SELECT,
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
  async adminCreateUser(actorId: string, dto: AdminCreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.withSerializableUserWrite(async tx => {
        const actor = await tx.user.findUnique({
          where: { id: actorId, deletedAt: null }, select: { role: true, bannedUntil: true },
        });
        if (!actor || actor.role !== 'ADMIN' || (actor.bannedUntil && actor.bannedUntil > new Date())) {
          throw new ForbiddenException('管理操作の権限がありません');
        }
        return tx.user.create({
          data: {
            email: dto.email, username: dto.username, displayName: dto.displayName,
            passwordHash, role: 'USER', stats: { create: {} }, gameSettings: { create: {} },
          },
          select: ADMIN_USER_SELECT,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('メールアドレスまたはユーザー名が既に使用されています');
      }
      throw error;
    }
  }

  async adminDeleteUser(actorId: string, targetId: string, confirmation: string) {
    if (confirmation !== 'DELETE USER') throw new BadRequestException('削除確認文言が一致しません');
    if (actorId === targetId) throw new ForbiddenException('自分自身の削除はプロフィールから行ってください');
    const target = await this.withSerializableUserWrite(async tx => {
      const actor = await tx.user.findUnique({
        where: { id: actorId, deletedAt: null }, select: { role: true, bannedUntil: true },
      });
      if (!actor || actor.role !== 'ADMIN' || (actor.bannedUntil && actor.bannedUntil > new Date())) {
        throw new ForbiddenException('管理操作の権限がありません');
      }
      const user = await tx.user.findUnique({
        where: { id: targetId, deletedAt: null },
        select: { role: true, email: true, displayName: true, fileUploads: { select: { storageUrl: true } } },
      });
      if (!user) throw new NotFoundException('ユーザーが見つかりません');
      if (user.role === 'ADMIN') await this.requireAnotherAdmin(tx, targetId);
      await tx.chatMessage.deleteMany({ where: { senderId: targetId } });
      await tx.fileUpload.deleteMany({ where: { uploaderId: targetId } });
      await tx.user.delete({ where: { id: targetId } });
      return user;
    });
    return this.finishAccountDeletion(targetId, target);
  }

  async adminEditUser(actorId: string, targetId: string, dto: AdminEditUserDto) {
    return this.updateManagedUser(actorId, targetId, {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
      ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
    }, true);
  }

  async adminUpdateRole(actorId: string, targetId: string, role: Role) {
    return this.updateManagedUser(actorId, targetId, { role }, true);
  }

  // ── [ADMIN/MOD] BAN ────────────────────────────────────────
  async adminBanUser(actorId: string, targetId: string, dto: BanUserDto) {
    if (dto.durationDays !== undefined && dto.bannedUntil !== undefined) {
      throw new BadRequestException(
        'durationDaysとbannedUntilは同時に指定できません',
      );
    }

    let bannedUntil: Date;
    if (dto.durationDays !== undefined) {
      bannedUntil = new Date(
        Date.now() + dto.durationDays * 24 * 60 * 60 * 1000,
      );
    } else if (dto.bannedUntil !== undefined) {
      bannedUntil = new Date(dto.bannedUntil);
      if (bannedUntil <= new Date()) {
        throw new BadRequestException('bannedUntilは未来の日時にしてください');
      }
    } else {
      bannedUntil = new Date('9999-12-31T23:59:59.999Z');
    }

    return this.updateManagedUser(actorId, targetId, {
      bannedUntil,
      banReason: dto.reason,
    });
  }

  // ── [ADMIN] BAN解除 ────────────────────────────────────────
  async adminUnbanUser(actorId: string, targetId: string) {
    return this.updateManagedUser(actorId, targetId, {
      bannedUntil: null,
      banReason: null,
    });
  }

  private async updateManagedUser(
    actorId: string,
    targetId: string,
    data: { role?: Role; bannedUntil?: Date | null; banReason?: string | null; displayName?: string; bio?: string },
    adminOnly = false,
  ) {
    if (actorId === targetId) {
      throw new ForbiddenException('自分自身の権限・BAN状態は変更できません');
    }
    // Read authorization and mutate atomically. Serializable prevents two
    // administrators concurrently demoting/banning each other from leaving
    // no usable administrator. A conflict retries with fresh authorization.
    return this.withSerializableUserWrite(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId, deletedAt: null },
        select: { role: true, bannedUntil: true },
      });
      const now = new Date();
      if (
        !actor ||
        (actor.bannedUntil && actor.bannedUntil > now) ||
        (actor.role !== 'ADMIN' && (adminOnly || actor.role !== 'MODERATOR'))
      ) {
        throw new ForbiddenException('管理操作の権限がありません');
      }
      const target = await tx.user.findUnique({
        where: { id: targetId, deletedAt: null },
        select: { role: true },
      });
      if (!target) throw new NotFoundException('ユーザーが見つかりません');
      if (
        actor.role === 'MODERATOR' &&
        (target.role === 'ADMIN' || target.role === 'MODERATOR')
      ) {
        throw new ForbiddenException('同格以上のユーザーは操作できません');
      }
      if (
        target.role === 'ADMIN' &&
        ((data.role !== undefined && data.role !== 'ADMIN') || data.bannedUntil)
      ) {
        await this.requireAnotherAdmin(tx, targetId);
      }
      return tx.user.update({
        where: { id: targetId },
        data,
        select: ADMIN_USER_SELECT,
      });
    });
  }

  private async requireAnotherAdmin(
    tx: Prisma.TransactionClient,
    targetId: string,
  ) {
    const remaining = await tx.user.count({
      where: {
        id: { not: targetId },
        role: 'ADMIN',
        deletedAt: null,
        OR: [{ bannedUntil: null }, { bannedUntil: { lte: new Date() } }],
      },
    });
    if (remaining === 0)
      throw new ForbiddenException('最後の有効な管理者は変更・削除できません');
  }

  private async withSerializableUserWrite<T>(
    change: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(change, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          if (attempt < 2) continue;
          throw new ConflictException(
            '管理状態が変更されました。再試行してください',
          );
        }
        throw error;
      }
    }
    throw new ConflictException('管理状態が変更されました。再試行してください');
  }

  // ── ユーザー情報サニタイズ ────────────────────────────────
  private sanitizeUser(user: any) {
    const { passwordHash, twoFactorSecret, ...safeUser } = user;
    return safeUser;
  }

  private sanitizePublicUser(user: any) {
    const {
      passwordHash,
      twoFactorSecret,
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
