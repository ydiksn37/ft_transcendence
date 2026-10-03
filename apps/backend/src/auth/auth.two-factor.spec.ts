import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('2FA lifecycle protections', () => {
  const user = {
    id: 'owner',
    email: 'test@example.com',
    role: 'USER',
    twoFactorEnabled: false,
    twoFactorSecret: null as string | null,
    bannedUntil: null,
  };
  const findUnique = jest.fn(),
    updateMany = jest.fn(),
    sign = jest.fn(),
    verify = jest.fn();
  const service = new AuthService(
    { user: { findUnique, updateMany } } as unknown as PrismaService,
    {} as RedisService,
    { sign, verify } as unknown as JwtService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    findUnique.mockResolvedValue(user);
    updateMany.mockResolvedValue({ count: 1 });
    sign.mockReturnValue('signed-token');
    verify.mockReturnValue({ sub: 'owner', isTwoFactor: true });
  });

  it('returns setup material only during enrollment and never replaces enabled 2FA', async () => {
    const enrollment = await service.generateTwoFactorAuthSecret('owner');
    expect(enrollment.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(enrollment.secret).toBeTruthy();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'owner',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
      data: { twoFactorSecret: enrollment.secret },
    });
    findUnique.mockResolvedValue({ ...user, twoFactorEnabled: true });
    await expect(
      service.generateTwoFactorAuthSecret('owner'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('enables, authenticates and disables using valid codes without returning the stored secret', async () => {
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);
    findUnique.mockResolvedValue({
      ...user,
      twoFactorSecret: secret,
      twoFactorEnabled: true,
    });
    expect(await service.turnOnTwoFactorAuth('owner', code)).toEqual({
      success: true,
    });
    const result = await service.authenticate2FA(
      'owner',
      code,
      'temporary-token',
    );
    expect(result).toEqual({
      userId: 'owner',
      accessToken: 'signed-token',
      refreshToken: 'signed-token',
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(await service.turnOffTwoFactorAuth('owner', code)).toEqual({
      success: true,
    });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: 'owner', twoFactorSecret: secret },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  });

  it.each([
    { twoFactorEnabled: false },
    { bannedUntil: new Date('2999-01-01') },
  ])('rejects a no-longer-eligible login %j', async (overrides) => {
    findUnique.mockResolvedValue({
      ...user,
      twoFactorEnabled: true,
      twoFactorSecret: authenticator.generateSecret(),
      ...overrides,
    });
    await expect(
      service.authenticate2FA('owner', '123456', 'temporary-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects a changed secret between verification and update', async () => {
    const secret = authenticator.generateSecret();
    findUnique.mockResolvedValue({ ...user, twoFactorSecret: secret });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.turnOnTwoFactorAuth('owner', authenticator.generate(secret)),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.generateTwoFactorAuthSecret('owner'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
