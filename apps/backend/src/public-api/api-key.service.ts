import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** APIキーを生成して DB に保存 */
  async createApiKey(userId: string, label: string, rateLimit = 1000, expiresAt?: Date) {
    // 安全なランダムキーを生成 (32バイト = 64文字の hex)
    const rawKey = crypto.randomBytes(32).toString('hex');
    const prefix = rawKey.substring(0, 8);
    const keyHash = await bcrypt.hash(rawKey, 12);

    const record = await this.prisma.apiKey.create({
      data: {
        userId,
        label,
        keyPrefix: prefix,
        keyHash,
        rateLimit,
        expiresAt,
      },
    });

    this.logger.log(`APIキー作成: userId=${userId}, label=${label}`);

    return {
      id: record.id,
      label: record.label,
      key: rawKey,      // 生成時のみ返す（以降は表示不可）
      prefix: record.keyPrefix,
      rateLimit: record.rateLimit,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      warning: 'このキーは今後表示されません。安全な場所に保管してください。',
    };
  }

  /** ユーザーのAPIキー一覧（キー本体は返さない） */
  async listApiKeys(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        label: true,
        keyPrefix: true,
        rateLimit: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** APIキーを無効化 */
  async revokeApiKey(userId: string, keyId: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id: keyId, userId } });
    if (!key) throw new NotFoundException('APIキーが見つかりません');

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    return { message: 'APIキーを無効化しました' };
  }
}
