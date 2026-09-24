import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// Real Nest routing, guard, validation and service; DB/Redis are isolated fakes.
describe('Public API HTTP contract', () => {
  let app: INestApplication;
  const keys = ['a'.repeat(64), 'b'.repeat(64)];
  const saved = new Map<string, Record<string, unknown>>();
  const records = new Map<string, { id: string; userId: string; keyHash: string; rateLimit: number; expiresAt: Date | null }>();
  const counts = new Map<string, number>();
  const failure = (code: string) => new Prisma.PrismaClientKnownRequestError('test', { code, clientVersion: '6.12.0' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicApiController],
      providers: [PublicApiService, ApiKeyGuard,
        { provide: PrismaService, useValue: {
          apiKey: {
            findFirst: async ({ where }: { where: { keyPrefix: string } }) => records.get(where.keyPrefix) ?? null,
            update: async () => ({}),
          },
          userGameSettings: {
            findUnique: async ({ where }: { where: { userId: string } }) => saved.get(where.userId) ?? null,
            create: async ({ data }: { data: Record<string, unknown> & { userId: string } }) => {
              if (saved.has(data.userId)) throw failure('P2002');
              const value = { ...data, keyBindings: data.keyBindings === Prisma.DbNull ? null : data.keyBindings };
              saved.set(data.userId, value);
              return value;
            },
            update: async ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
              if (!saved.has(where.userId)) throw failure('P2025');
              const value = { ...data, userId: where.userId, keyBindings: data.keyBindings === Prisma.DbNull ? null : data.keyBindings };
              saved.set(where.userId, value);
              return value;
            },
            deleteMany: async ({ where }: { where: { userId: string } }) => ({ count: saved.delete(where.userId) ? 1 : 0 }),
          },
        } },
        { provide: RedisService, useValue: { incrementWindow: async (key: string) => {
          const count = (counts.get(key) ?? 0) + 1;
          counts.set(key, count);
          return { count, ttl: 100 };
        } } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(async () => {
    saved.clear(); records.clear(); counts.clear();
    for (const [i, key] of keys.entries()) records.set(key.slice(0, 8), {
      id: `key-${i}`, userId: `owner-${i}`, keyHash: await bcrypt.hash(key, 4), rateLimit: 100, expiresAt: null,
    });
  });
  const endpoint = '/api/public/me/settings';

  it('supports POST/GET/PUT/DELETE without crossing key ownership', async () => {
    const http = request(app.getHttpServer());
    await http.post(endpoint).set('X-API-Key', keys[0]).send({ volume: 20 }).expect(201);
    await http.post(endpoint).set('X-API-Key', keys[0]).send({}).expect(409);
    await http.get(endpoint).set('X-API-Key', keys[1]).expect(404);
    const replaced = await http.put(endpoint).set('X-API-Key', keys[0]).send({ showGhost: false }).expect(200);
    expect(replaced.body.volume).toBe(100);
    expect(replaced.body.showGhost).toBe(false);
    expect(replaced.body.userId).toBe('owner-0');
    await http.delete(endpoint).set('X-API-Key', keys[1]).expect(204);
    await http.get(endpoint).set('X-API-Key', keys[0]).expect(200);
    await http.delete(endpoint).set('X-API-Key', keys[0]).expect(204);
    await http.delete(endpoint).set('X-API-Key', keys[0]).expect(204);
    await http.get(endpoint).set('X-API-Key', keys[0]).expect(404);
    await http.put(endpoint).set('X-API-Key', keys[0]).send({}).expect(404);
  });

  it('returns 401/400/429 through the real HTTP pipeline', async () => {
    const http = request(app.getHttpServer());
    await http.get(endpoint).expect(401);
    await http.get(endpoint).set('X-API-Key', 'invalid').expect(401);
    await http.post(endpoint).set('X-API-Key', keys[0]).send({ userId: 'victim' }).expect(400);
    await http.post(endpoint).set('X-API-Key', keys[0]).send({ volume: 101 }).expect(400);
    const record = records.get(keys[0].slice(0, 8))!;
    record.expiresAt = new Date(0);
    await http.get(endpoint).set('X-API-Key', keys[0]).expect(401);
    record.expiresAt = null;
    record.rateLimit = 1;
    const limited = await http.get(endpoint).set('X-API-Key', keys[0]).expect(429);
    expect(limited.body.retryAfter).toBe(100);
    records.delete(keys[0].slice(0, 8));
    await http.get(endpoint).set('X-API-Key', keys[0]).expect(401);
  });

  it('publishes nine operations with API key security and preference request schemas', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key').build());
    const methods = ['get', 'post', 'put', 'delete'] as const;
    expect(Object.values(document.paths).flatMap(item => methods.filter(method => item?.[method])).length).toBe(9);
    for (const method of methods) {
      const operation = document.paths[endpoint]?.[method];
      expect(operation?.security).toEqual([{ 'api-key': [] }]);
      expect(operation?.responses['401']).toBeDefined();
      expect(operation?.responses['429']).toBeDefined();
    }
    expect(document.paths[endpoint]?.put?.requestBody).toBeDefined();
    expect(document.components?.schemas?.PublicGameSettingsDto).toBeDefined();
  });
});
