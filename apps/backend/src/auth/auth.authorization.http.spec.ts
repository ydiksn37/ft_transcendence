import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminUsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

// Real Passport JWT verification, JwtAuthGuard, RolesGuard, routing and DTO validation.
describe('HTTP JWT authentication and role authorization', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const actorId = '00000000-0000-4000-8000-000000000001';
  const originalSecret = process.env.JWT_SECRET;
  const adminCreateUser = jest.fn();
  const body = {
    email: 'managed@example.com',
    username: 'managed_user',
    displayName: 'Managed User',
    password: 'StrongPassword123!',
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'http-auth-e2e-secret';
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: process.env.JWT_SECRET }),
      ],
      controllers: [AdminUsersController],
      providers: [
        JwtStrategy,
        RolesGuard,
        { provide: UsersService, useValue: { adminCreateUser } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    adminCreateUser.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      role: 'USER',
      displayName: body.displayName,
    });
  });

  const token = (role: string, expiresIn = 60) =>
    jwt.sign({ sub: actorId, email: 'actor@example.com', role }, { expiresIn });

  it('rejects missing, malformed and expired bearer tokens before the service', async () => {
    const http = request(app.getHttpServer());
    await http.post('/api/admin/users').send(body).expect(401);
    await http
      .post('/api/admin/users')
      .set('Authorization', 'Bearer not-a-jwt')
      .send(body)
      .expect(401);
    await http
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token('ADMIN', -1)}`)
      .send(body)
      .expect(401);
    expect(adminCreateUser).not.toHaveBeenCalled();
  });

  it('accepts a valid signature but rejects a role without route permission', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token('USER')}`)
      .send(body)
      .expect(403);
    expect(adminCreateUser).not.toHaveBeenCalled();
  });

  it('passes the verified administrator identity to the protected operation', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token('ADMIN')}`)
      .send(body)
      .expect(201);
    expect(adminCreateUser).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining(body),
    );
  });
});
