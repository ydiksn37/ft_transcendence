import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey || apiKey.length < 8) {
      throw new UnauthorizedException('X-API-Key ヘッダーが必要です');
    }

    const prefix = apiKey.substring(0, 8);

    // プレフィックスでキーを検索
    const keyRecord = await this.prisma.apiKey.findFirst({
      where: { keyPrefix: prefix, isActive: true },
    });

    if (!keyRecord) {
      throw new UnauthorizedException('無効なAPIキーです');
    }

    // 有効期限チェック
    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('APIキーの有効期限が切れています');
    }

    // ハッシュ比較
    const isValid = await bcrypt.compare(apiKey, keyRecord.keyHash);
    if (!isValid) {
      throw new UnauthorizedException('無効なAPIキーです');
    }

    // レート制限 (1時間あたり)
    const rateLimitKey = `ratelimit:apikey:${keyRecord.id}`;
    const current = await this.redis.incr(rateLimitKey);
    if (current === 1) {
      await this.redis.expire(rateLimitKey, 3600);
    }

    if (current > keyRecord.rateLimit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `レート制限超過。上限: ${keyRecord.rateLimit}リクエスト/時間`,
          retryAfter: await this.redis.ttl(rateLimitKey),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 最終使用日時を更新（非同期）
    this.prisma.apiKey
      .update({ where: { id: keyRecord.id }, data: { lastUsedAt: new Date() } })
      .catch((e: any) => this.logger.error(e));

    request.apiKeyRecord = keyRecord;
    return true;
  }
}
