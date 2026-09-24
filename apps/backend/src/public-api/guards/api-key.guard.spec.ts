import { ExecutionContext, HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ApiKeyGuard } from './api-key.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('API key authentication and rate limit', () => {
  const raw = 'a'.repeat(64);
  const apiKey = { findFirst: jest.fn(), update: jest.fn() };
  const redis = { incrementWindow: jest.fn() };
  const guard = new ApiKeyGuard({ apiKey } as unknown as PrismaService, redis as unknown as RedisService);
  const request = (value: unknown) => {
    const req = { headers: { 'x-api-key': value } };
    return { req, context: { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext };
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    apiKey.findFirst.mockResolvedValue({ id: 'key-id', keyHash: await bcrypt.hash(raw, 4), expiresAt: null, rateLimit: 2 });
    apiKey.update.mockResolvedValue({});
    redis.incrementWindow.mockResolvedValue({ count: 1, ttl: 3600 });
  });
  it.each([undefined, null, [], ['a', 'b'], 123, {}, 'short', 'a'.repeat(65)])('rejects malformed header %j before database/hash work', async value => {
    await expect(guard.canActivate(request(value).context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(apiKey.findFirst).not.toHaveBeenCalled();
  });
  it('rejects unknown/revoked keys and filters deleted or banned owners', async () => {
    apiKey.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(request(raw).context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(apiKey.findFirst.mock.calls[0][0].where).toEqual(expect.objectContaining({
      isActive: true, user: expect.objectContaining({ deletedAt: null, OR: expect.any(Array) }),
    }));
    expect(redis.incrementWindow).not.toHaveBeenCalled();
  });
  it('rejects a wrong secret sharing the same prefix', async () => {
    await expect(guard.canActivate(request('aaaaaaaa' + 'b'.repeat(56)).context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.incrementWindow).not.toHaveBeenCalled();
  });
  it('rejects expiration at the exact boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-23T00:00:00Z'));
    try {
      apiKey.findFirst.mockResolvedValue({ expiresAt: new Date() });
      await expect(guard.canActivate(request(raw).context)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(redis.incrementWindow).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
  it('allows the quota boundary, rejects excess, and reopens a new window', async () => {
    for (const count of [1, 2, 3, 1]) {
      redis.incrementWindow.mockResolvedValueOnce({ count, ttl: 120 });
      const { context, req } = request(raw);
      if (count <= 2) {
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(req).toHaveProperty('apiKeyRecord.id', 'key-id');
      } else {
        try { await guard.canActivate(context); throw new Error('expected rejection'); }
        catch (error) {
          expect(error).toBeInstanceOf(HttpException);
          expect((error as HttpException).getStatus()).toBe(429);
          expect((error as HttpException).getResponse()).toEqual(expect.objectContaining({ retryAfter: 120 }));
        }
      }
    }
    expect(redis.incrementWindow).toHaveBeenCalledWith('ratelimit:apikey:key-id', 3600);
    expect(apiKey.update).toHaveBeenCalledTimes(3);
  });
});
