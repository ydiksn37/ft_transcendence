import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FtOauthGuard, JwtAuthGuard } from './guards/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// Real Nest routing, DTO validation and AuthService; persistence and signing are isolated fakes.
describe('Auth HTTP 2FA response contract', () => {
  let app: INestApplication;
  const user = {
    id: '8b1f83c8-44a5-4a34-9d49-3bbfb2d44ef8',
    email: 'owner@example.com',
    username: 'owner',
    role: 'USER',
    passwordHash: '',
    twoFactorEnabled: false,
    twoFactorSecret: null as string | null,
    deletedAt: null as Date | null,
    bannedUntil: null as Date | null,
  };

  beforeAll(async () => {
    user.passwordHash = await bcrypt.hash('StrongPassword42!', 4);
    const prisma = {
      user: {
        findUnique: async () => ({ ...user }),
        updateMany: async ({
          data,
        }: {
          data: { twoFactorEnabled?: boolean; twoFactorSecret?: string | null };
        }) => {
          if (data.twoFactorEnabled !== undefined) {
            user.twoFactorEnabled = data.twoFactorEnabled;
          }
          if (data.twoFactorSecret !== undefined) {
            user.twoFactorSecret = data.twoFactorSecret;
          }
          return { count: 1 };
        },
      },
    };
    const jwt = {
      sign: (payload: { isTwoFactor?: boolean }) =>
        payload.isTwoFactor ? 'temporary-token' : 'signed-token',
      verify: () => ({ sub: user.id, isTwoFactor: true }),
    };
    const authenticatedGuard = {
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest().user = {
          id: user.id,
          email: user.email,
          role: user.role,
        };
        return true;
      },
    };

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: {} },
        { provide: JwtService, useValue: jwt },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticatedGuard)
      .overrideGuard(FtOauthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes setup material only at enrollment and never leaks the stored secret later', async () => {
    const enrollment = await request(app.getHttpServer())
      .post('/api/auth/2fa/generate')
      .set('Authorization', 'Bearer test')
      .expect(201);
    const secret = enrollment.body.secret as string;
    expect(secret).toBeTruthy();
    expect(enrollment.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const code = authenticator.generate(secret);
    const enabled = await request(app.getHttpServer())
      .post('/api/auth/2fa/turn-on')
      .set('Authorization', 'Bearer test')
      .send({ code })
      .expect(201);
    expect(enabled.body).toEqual({ success: true });
    expect(JSON.stringify(enabled.body)).not.toContain(secret);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: 'StrongPassword42!' })
      .expect(200);
    expect(login.body).toEqual({
      require2FA: true,
      tempToken: 'temporary-token',
      userId: user.id,
    });
    expect(JSON.stringify(login.body)).not.toContain(secret);

    const authenticated = await request(app.getHttpServer())
      .post('/api/auth/2fa/authenticate')
      .send({ userId: user.id, code, tempToken: 'temporary-token' })
      .expect(200);
    expect(authenticated.body).toEqual({
      accessToken: 'signed-token',
      refreshToken: 'signed-token',
      userId: user.id,
    });
    expect(JSON.stringify(authenticated.body)).not.toContain(secret);

    const disabled = await request(app.getHttpServer())
      .post('/api/auth/2fa/turn-off')
      .set('Authorization', 'Bearer test')
      .send({ code })
      .expect(201);
    expect(disabled.body).toEqual({ success: true });
    expect(JSON.stringify(disabled.body)).not.toContain(secret);
  });
});

describe('42 OAuth callback with an email owned by another account', () => {
  let app: INestApplication;
  const update = jest.fn();
  const create = jest.fn();

  beforeAll(async () => {
    const prisma = {
      user: {
        findFirst: async () => null,
        findUnique: async ({ where }: { where: { email?: string } }) =>
          where.email === 'victim@student.42tokyo.jp'
            ? { id: 'password-account', email: where.email }
            : null,
        update,
        create,
      },
    };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: {} },
        { provide: JwtService, useValue: { sign: () => 'signed-token' } },
      ],
    })
      .overrideGuard(FtOauthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            oauthId: '4242',
            oauthProvider: '42',
            username: 'victim',
            displayName: 'Victim',
            email: 'victim@student.42tokyo.jp',
            avatarUrl: null,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses to link or create an account and reports a stable error code', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/42/callback?code=test&state=%2Fmenu')
      .expect(302);
    expect(response.headers.location).toBe(
      '/auth/callback?error=oauth_email_conflict',
    );
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
