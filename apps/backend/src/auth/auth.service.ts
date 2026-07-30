import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Setup2faDto } from './dto/twofa.dto';

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
      throw new ConflictException('メールアドレスまたはユーザー名が既に使用されています');
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
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('このアカウントは削除されています');
    }

    if (user.bannedUntil && user.bannedUntil > new Date()) {
      throw new UnauthorizedException(`アカウントがBANされています（解除: ${user.bannedUntil.toISOString()}）`);
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
    }

    // 2FA が有効な場合は仮トークンを発行してOTP送信
    if (user.twoFactorEnabled) {
      return this.initiate2fa(user);
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
      const usernameExists = await this.prisma.user.findUnique({ where: { username } });
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
            isEmailVerified: true, // OAuthプロバイダー経由は検証済みとみなす
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

    // 2FA が有効な場合
    if (user.twoFactorEnabled) {
      return this.initiate2fa(user);
    }

    return this.issueTokens(user);
  }

  // ── 2FA 開始: OTP送信 & 仮トークン発行 ──────────────────
  private async initiate2fa(user: { id: string; twoFactorMethod: any; twoFactorContact: string | null }) {
    const otp = this.generateOtp();
    const tempToken = `temp_${user.id}_${Date.now()}`;

    // RedisにOTPを保存 (TTL付き)
    await this.redis.setEx(`otp:${user.id}`, this.OTP_TTL, otp);
    await this.redis.setEx(`temp_token:${tempToken}`, this.TEMP_TOKEN_TTL, user.id);

    // OTP送信
    if (user.twoFactorMethod === 'EMAIL' && user.twoFactorContact) {
      await this.sendOtpEmail(user.twoFactorContact, otp);
    }
    // SMS は Twilio 未設定のため将来実装

    this.logger.log(`2FA OTP送信: userId=${user.id}, method=${user.twoFactorMethod}`);

    return {
      requires2FA: true,
      tempToken,
      method: user.twoFactorMethod,
    };
  }

  // ── 2FA 検証 ────────────────────────────────────────────
  async verify2fa(otp: string, tempToken: string) {
    const userId = await this.redis.get(`temp_token:${tempToken}`);
    if (!userId) {
      throw new UnauthorizedException('セッションが期限切れです。再度ログインしてください');
    }

    const storedOtp = await this.redis.get(`otp:${userId}`);
    if (!storedOtp || storedOtp !== otp) {
      throw new UnauthorizedException('OTPが正しくありません');
    }

    // 使用済みOTPを削除
    await this.redis.del(`otp:${userId}`);
    await this.redis.del(`temp_token:${tempToken}`);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.issueTokens(user, true);
  }

  // ── 2FA セットアップ ─────────────────────────────────────
  async setup2fa(userId: string, dto: Setup2faDto) {
    if (dto.method === 'SMS') {
      throw new BadRequestException('SMS認証は現在準備中です。メール認証をご使用ください');
    }

    // テスト送信
    const otp = this.generateOtp();
    await this.redis.setEx(`otp:${userId}`, this.OTP_TTL, otp);

    await this.sendOtpEmail(dto.contact, otp);

    // 設定を保存（OTP検証後に有効化 — verify2faSetup で完了させる）
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorMethod: dto.method,
        twoFactorContact: dto.contact,
      },
    });

    return { message: 'OTPを送信しました。コードを確認してください', method: dto.method };
  }

  // ── 2FA セットアップ確認 ─────────────────────────────────
  async confirmSetup2fa(userId: string, otp: string) {
    const storedOtp = await this.redis.get(`otp:${userId}`);
    if (!storedOtp || storedOtp !== otp) {
      throw new UnauthorizedException('OTPが正しくありません');
    }

    await this.redis.del(`otp:${userId}`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    this.logger.log(`2FA有効化: userId=${userId}`);
    return { message: '2段階認証を有効化しました' };
  }

  // ── 2FA 無効化 ───────────────────────────────────────────
  async disable2fa(userId: string, otp: string) {
    const storedOtp = await this.redis.get(`otp:${userId}`);
    if (!storedOtp || storedOtp !== otp) {
      // OTPが期限切れの場合はまず送信
      throw new UnauthorizedException('OTPが正しくありません。先にOTPを再送してください');
    }

    await this.redis.del(`otp:${userId}`);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorMethod: null,
        twoFactorContact: null,
      },
    });

    return { message: '2段階認証を無効化しました' };
  }

  // ── OTP 再送 ─────────────────────────────────────────────
  async resendOtp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorEnabled || !user.twoFactorContact) {
      throw new BadRequestException('2FA が設定されていません');
    }

    const otp = this.generateOtp();
    await this.redis.setEx(`otp:${userId}`, this.OTP_TTL, otp);

    if (user.twoFactorMethod === 'EMAIL') {
      await this.sendOtpEmail(user.twoFactorContact, otp);
    }

    return { message: 'OTPを再送しました' };
  }

  // ── Refresh Token ────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // ブラックリスト確認
      const isBlacklisted = await this.redis.exists(`blacklist:${refreshToken}`);
      if (isBlacklisted) throw new UnauthorizedException('トークンは無効化されています');

      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
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
  private issueTokens(user: { id: string; email: string; role: any }, twoFactorPassed = false) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      twoFactorPassed,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken, userId: user.id };
  }

  // ── OTP生成 ──────────────────────────────────────────────
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async sendOtpEmail(to: string, otp: string): Promise<void> {
    this.logger.log(`\n========================================\n🔐 開発用テストOTP: [ ${otp} ] (送信先: ${to})\n========================================\n`);

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 2525),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: '【ft_transcendence】2段階認証コード',
        text: `認証コード: ${otp}\n\nこのコードは${process.env.OTP_EXPIRES_MINUTES ?? 10}分間有効です。`,
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;
                      background: #0d1117; color: #e6edf3; border-radius: 12px;">
            <h2 style="color: #00ffcc; text-align: center;">🎮 ft_transcendence</h2>
            <p style="text-align: center;">2段階認証コード</p>
            <div style="background: #161b22; border: 2px solid #00ffcc; border-radius: 8px;
                        padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #00ffcc;">
                ${otp}
              </span>
            </div>
            <p style="color: #8b949e; text-align: center; font-size: 14px;">
              このコードは ${process.env.OTP_EXPIRES_MINUTES ?? 10} 分間有効です。<br>
              心当たりがない場合はこのメールを無視してください。
            </p>
          </div>
        `,
      });

      this.logger.log(`OTPメール送信成功: ${to}`);
    } catch (e: any) {
      this.logger.warn(`SMTP設定が不完全なためメールは送信されませんでした (エラー: ${e.message})。開発用ターミナル出力のOTPを使用してください。`);
    }
  }
}
