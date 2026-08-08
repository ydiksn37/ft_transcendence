import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression = require('compression');
import { initializeVault } from './vault';

async function bootstrap() {
  await initializeVault();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // ── セキュリティ ──────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger UI のため無効化
    }),
  );
  app.use(compression());

  // ── CORS ─────────────────────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    credentials: true,
  });

  // ── バリデーション ────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,      // DTOにないフィールドを除去
      transform: true,      // 型変換を自動実行
      forbidNonWhitelisted: true,
    }),
  );

  // ── グローバルプレフィックス ──────────────────────────────
  app.setGlobalPrefix('api');

  // ── Swagger ───────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ft_transcendence API')
    .setDescription(
      '対戦型テトリスプラットフォーム — Public API ドキュメント\n\n' +
        '認証方法:\n' +
        '- **JWT Bearer**: ログイン後に取得したアクセストークン\n' +
        '- **X-API-Key**: 公開API専用のAPIキー（レート制限あり）',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      'api-key',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`🚀 Server running on http://localhost:${port}/api`);
  logger.log(`📚 Swagger UI: http://localhost:${port}/api/docs`);
}
bootstrap();
