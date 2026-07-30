import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UsersController, AdminUsersController } from './users.controller';

@Module({
  imports: [
    MulterModule.register({ dest: process.env.UPLOAD_DIR ?? '/tmp/uploads' }),
  ],
  providers: [UsersService],
  controllers: [UsersController, AdminUsersController],
  exports: [UsersService],
})
export class UsersModule {}
