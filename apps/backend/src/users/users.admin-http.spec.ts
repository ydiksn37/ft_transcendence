import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminUsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

// Real HTTP routing, role guard, DTO validation and CurrentUser extraction.
// JWT identity and service persistence are test doubles; no real accounts change.
describe('admin management HTTP boundary', () => {
  let app: INestApplication;
  const target = '00000000-0000-4000-8000-000000000002';
  const actor = '00000000-0000-4000-8000-000000000001';
  const service = { adminCreateUser: jest.fn(), adminEditUser: jest.fn(), adminDeleteUser: jest.fn() };
  const body = { email: 'test@example.com', username: 'new_player', displayName: 'New Player', password: 'StrongPassword123!' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [RolesGuard, { provide: UsersService, useValue: service }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      const role = req.headers['x-test-role'];
      if (!role) throw new UnauthorizedException();
      req.user = { id: actor, role, email: 'actor@example.com' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    jest.clearAllMocks();
    service.adminCreateUser.mockResolvedValue({ id: target, role: 'USER', displayName: body.displayName });
    service.adminEditUser.mockResolvedValue({ id: target, displayName: 'Updated' });
    service.adminDeleteUser.mockResolvedValue({ message: 'Deleted' });
  });

  it('requires authentication and rejects every non-admin role for all three mutations', async () => {
    const http = request(app.getHttpServer());
    await http.post('/api/admin/users').send(body).expect(401);
    for (const role of ['MODERATOR', 'USER', 'GUEST']) {
      await http.post('/api/admin/users').set('x-test-role', role).send(body).expect(403);
      await http.patch(`/api/admin/users/${target}`).set('x-test-role', role).send({ displayName: 'Updated' }).expect(403);
      await http.delete(`/api/admin/users/${target}`).set('x-test-role', role).send({ confirmation: 'DELETE USER' }).expect(403);
    }
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it('passes the authenticated actor and validated payload to each service operation', async () => {
    const http = request(app.getHttpServer());
    await http.post('/api/admin/users').set('x-test-role', 'ADMIN').send(body).expect(201);
    expect(service.adminCreateUser).toHaveBeenCalledWith(actor, expect.objectContaining(body));
    await http.patch(`/api/admin/users/${target}`).set('x-test-role', 'ADMIN').send({ displayName: 'Updated' }).expect(200);
    expect(service.adminEditUser).toHaveBeenCalledWith(actor, target, expect.objectContaining({ displayName: 'Updated' }));
    await http.delete(`/api/admin/users/${target}`).set('x-test-role', 'ADMIN').send({ confirmation: 'DELETE USER' }).expect(200);
    expect(service.adminDeleteUser).toHaveBeenCalledWith(actor, target, 'DELETE USER');
  });

  it('rejects privilege injection, invalid UUIDs, invalid creation data and missing deletion confirmation', async () => {
    const http = request(app.getHttpServer());
    for (const invalid of [{ ...body, role: 'ADMIN' }, { ...body, password: 'short' }, { ...body, email: 'invalid' }]) {
      await http.post('/api/admin/users').set('x-test-role', 'ADMIN').send(invalid).expect(400);
    }
    await http.patch(`/api/admin/users/${target}`).set('x-test-role', 'ADMIN').send({ twoFactorSecret: 'replace' }).expect(400);
    await http.patch(`/api/admin/users/${target}`).set('x-test-role', 'ADMIN').send({ displayName: null }).expect(400);
    await http.patch('/api/admin/users/not-a-uuid').set('x-test-role', 'ADMIN').send({ displayName: 'Updated' }).expect(400);
    await http.delete(`/api/admin/users/${target}`).set('x-test-role', 'ADMIN').send({}).expect(400);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });
});
