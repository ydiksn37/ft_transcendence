import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;
  private readonly OTP_TTL = Number(process.env.OTP_EXPIRES_MINUTES ?? 10) * 60;
  private readonly TEMP_TOKEN_TTL = 300; // 5分

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  // ── 通常登録 ─────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (exists) {
      throw new ConflictException(
        'メールアドレスまたはユーザー名が既に使用されています',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        displayName: dto.displayName,
        passwordHash,
        stats: { create: {} },
        gameSettings: { create: {} },
      },
    });

    this.logger.log(`新規ユーザー登録: ${user.username}`);
    return this.issueTokens(user);
  }

  // ── ログイン ──────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(
        'メールアドレスまたはパスワードが正しくありません',
      );
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('このアカウントは削除されています');
    }

    if (user.bannedUntil && user.bannedUntil > new Date()) {
      throw new UnauthorizedException(
        `アカウントがBANされています（解除: ${user.bannedUntil.toISOString()}）`,
      );
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException(
        'メールアドレスまたはパスワードが正しくありません',
      );
    }

    return this.issueTokens(user);
  }

  // ── 42 OAuth ログイン / 初回登録 ─────────────────────────
  async loginOrRegisterOauth(profile: {
    oauthId: string;
    oauthProvider: string;
    username: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  }) {
    let user = await this.prisma.user.findFirst({
      where: { oauthProvider: profile.oauthProvider, oauthId: profile.oauthId },
    });

    if (!user) {
      // メールアドレスの重複チェック
      const emailExists = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      // ユーザー名の重複を回避
      let username = profile.username;
      const usernameExists = await this.prisma.user.findUnique({
        where: { username },
      });
      if (usernameExists) username = `${username}_${Date.now()}`;

      if (emailExists) {
        // 既存アカウントにOAuthを紐付け
        user = await this.prisma.user.update({
          where: { id: emailExists.id },
          data: {
            oauthProvider: profile.oauthProvider,
            oauthId: profile.oauthId,
            avatarUrl: profile.avatarUrl ?? emailExists.avatarUrl,
          },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            oauthProvider: profile.oauthProvider,
            oauthId: profile.oauthId,
            stats: { create: {} },
            gameSettings: { create: {} },
          },
        });
        this.logger.log(`42 OAuthで新規ユーザー登録: ${user.username}`);
      }
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('このアカウントは削除されています');
    }

    if (user.bannedUntil && user.bannedUntil > new Date()) {
      throw new UnauthorizedException(`アカウントがBANされています`);
    }

    return this.issueTokens(user);
  }

  // ── Refresh Token ────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // ブラックリスト確認
      const isBlacklisted = await this.redis.exists(
        `blacklist:${refreshToken}`,
      );
      if (isBlacklisted)
        throw new UnauthorizedException('トークンは無効化されています');

      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: payload.sub },
      });
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('リフレッシュトークンが無効です');
    }
  }

  // ── ログアウト (トークンブラックリスト) ────────────────
  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const ttl = 7 * 24 * 60 * 60; // 7日間
      await this.redis.setEx(`blacklist:${refreshToken}`, ttl, '1');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isOnline: false, lastSeenAt: new Date() },
    });

    return { message: 'ログアウトしました' };
  }

  // ── トークン発行 ──────────────────────────────────────────
  private issueTokens(user: { id: string; email: string; role: any }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken, userId: user.id };
  }
}
