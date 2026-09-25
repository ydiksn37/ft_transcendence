import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GameMode, TournamentStatus } from '@prisma/client';
import { ApiKeyController, PublicApiController } from './public-api.controller';
import { ApiKeyService } from './api-key.service';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { PublicApiService } from './public-api.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import {
  historyResponse,
  statsResponse,
  tournamentsResponse,
} from './public-api.schemas';

describe('Public API response documentation', () => {
  it('publishes a response schema for every successful JSON operation without opening a socket', async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicApiController, ApiKeyController],
      providers: [
        { provide: PublicApiService, useValue: {} },
        { provide: ApiKeyService, useValue: {} },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .addApiKey(
            { type: 'apiKey', in: 'header', name: 'X-API-Key' },
            'api-key',
          )
          .addBearerAuth(undefined, 'access-token')
          .build(),
      );
      let operations = 0;
      for (const [url, path] of Object.entries(document.paths)) {
        const keyManagement = url.startsWith('/api/keys');
        for (const method of ['get', 'post', 'put', 'delete'] as const) {
          const operation = path?.[method];
          if (!operation) continue;
          operations++;
          expect(operation.security).toEqual([
            { [keyManagement ? 'access-token' : 'api-key']: [] },
          ]);
          for (const status of keyManagement
            ? ['400', '401']
            : ['400', '401', '429']) {
            const error = operation.responses[status];
            expect(error).toBeDefined();
            if (error && !('$ref' in error))
              expect(error.content?.['application/json']?.schema).toMatchObject(
                { example: { statusCode: Number(status) } },
              );
          }
          const status =
            method === 'delete' && !keyManagement
              ? '204'
              : method === 'post'
                ? '201'
                : '200';
          const response = operation.responses[status];
          expect(response).toBeDefined();
          if (response && !('$ref' in response) && status !== '204') {
            expect(
              response.content?.['application/json']?.schema,
            ).toMatchObject({
              type: keyManagement && method === 'get' ? 'array' : 'object',
            });
          }
        }
      }
      expect(operations).toBe(12);
    } finally {
      await app.close();
    }
  });

  it('documents Prisma Decimal strings, nullable deleted relations and all enum values', () => {
    expect(statsResponse.properties?.winRate).toMatchObject({ type: 'string' });
    expect(historyResponse.properties?.data).toMatchObject({
      items: {
        properties: {
          gameMode: { enum: Object.values(GameMode) },
          player2Apm: { type: 'string', nullable: true },
          player1: { nullable: true },
          player2: { nullable: true },
          winner: { nullable: true },
        },
      },
    });
    expect(tournamentsResponse.properties?.data).toMatchObject({
      items: {
        properties: {
          status: { enum: Object.values(TournamentStatus) },
          creator: { nullable: true },
        },
      },
    });
  });
});
