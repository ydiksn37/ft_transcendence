import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UsersController, AdminUsersController } from './users.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';

@Module({
  imports: [
    MulterModule.register({ dest: process.env.UPLOAD_DIR ?? '/tmp/uploads' }),
  ],
  providers: [UsersService, AnalyticsService, ExportService],
  controllers: [
    UsersController,
    AdminUsersController,
    AnalyticsController,
    ExportController,
  ],
  exports: [UsersService],
})
export class UsersModule {}
