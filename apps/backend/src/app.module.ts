import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GameModule } from './game/game.module';
import { PublicApiModule } from './public-api/public-api.module';
import { TournamentModule } from './tournament/tournament.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { SprintModule } from './sprint/sprint.module';
import { ChatModule } from './chat/chat.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ChatModule,
    // ── 設定 ────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // ── レート制限（グローバル） ─────────────────────────────
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 60秒
        limit: 100, // 100リクエスト/分
      },
    ]),

    // ── スケジュール（日次集計等） ────────────────────────────
    ScheduleModule.forRoot(),

    // ── アップロードファイル静的配信 ─────────────────────────
    ServeStaticModule.forRoot({
      rootPath: process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),

    // ── コアモジュール ────────────────────────────────────────
    PrismaModule,
    RedisModule,
    MailModule,

    // ── 機能モジュール ────────────────────────────────────────
    AuthModule,
    UsersModule,
    GameModule,
    TournamentModule,
    PublicApiModule,
    SprintModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // JWT認証をグローバルガードとして登録
    // @Public() デコレータが付いたルートのみスキップ
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
      inject: [Reflector],
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new RolesGuard(reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
