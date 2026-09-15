import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';

describe('AuthService deleted accounts', () => {
  it('rejects login after an account has been permanently deleted', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as RedisService,
      {} as JwtService,
    );

    await expect(
      service.login({
        email: 'deleted@example.com',
        password: 'no-longer-valid',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
