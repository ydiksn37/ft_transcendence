import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto, SearchUsersDto, BanUserDto, SearchHistoryDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: '自分のプロフィール取得' })
  getMe(@CurrentUser() user: any) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'プロフィール更新' })
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Patch('me/settings')
  @ApiOperation({ summary: 'ゲーム設定を更新する' })
  updateSettings(@CurrentUser() user: any, @Body() body: any) {
    return this.usersService.updateGameSettings(user.id, body);
  }

  @Delete('me')
  @ApiOperation({ summary: 'アカウント削除（ソフトデリート）' })
  deleteMe(@CurrentUser() user: any) {
    return this.usersService.deleteMe(user.id);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'アバター画像をアップロード' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `avatar-${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(
            new Error('JPG/PNG/GIF/WebPのみアップロード可能です'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const avatarUrl = `/uploads/${file.filename}`;
    return this.usersService.updateAvatar(user.id, avatarUrl);
  }

  @Get('search')
  @ApiOperation({ summary: 'ユーザー検索（ページネーション付き）' })
  searchUsers(@Query() dto: SearchUsersDto) {
    return this.usersService.searchUsers(dto);
  }

  @Get('friends')
  @ApiOperation({ summary: 'フレンド一覧取得' })
  getFriends(@CurrentUser() user: any) {
    return this.usersService.getFriends(user.id);
  }

  @Post('friends/request')
  @ApiOperation({ summary: 'フレンド申請を送る' })
  sendFriendRequest(
    @CurrentUser() user: any,
    @Body() body: { addresseeId?: string; username?: string },
  ) {
    return this.usersService.sendFriendRequest(user.id, body);
  }

  @Patch('friends/:id')
  @ApiOperation({ summary: 'フレンド申請を承認/拒否' })
  respondFriendRequest(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { accept: boolean },
  ) {
    return this.usersService.respondFriendRequest(user.id, id, body.accept);
  }

  @Delete('friends/:id')
  @ApiOperation({ summary: 'フレンドを削除' })
  removeFriend(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.removeFriend(user.id, id);
  }

  @Post('block/:id')
  @ApiOperation({ summary: 'ユーザーをブロック' })
  blockUser(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.blockUser(user.id, id);
  }

  @Delete('block/:id')
  @ApiOperation({ summary: 'ブロックを解除' })
  unblockUser(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.unblockUser(user.id, id);
  }

  @Get('me/stats')
  @ApiOperation({ summary: '自分のゲーム統計取得（APM/PPS/勝率等）' })
  getMyStats(@CurrentUser() user: any) {
    return this.usersService.getUserStats(user.id);
  }

  @Get('me/history')
  @ApiOperation({ summary: '自分の対戦履歴取得' })
  getMyHistory(
    @CurrentUser() user: any,
    @Query() dto: SearchHistoryDto
  ) {
    return this.usersService.getGameHistory(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ユーザープロフィール取得' })
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'ゲーム統計取得（APM/PPS/勝率等）' })
  getUserStats(@Param('id') id: string) {
    return this.usersService.getUserStats(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: '対戦履歴取得' })
  getGameHistory(
    @Param('id') id: string,
    @Query() dto: SearchHistoryDto
  ) {
    return this.usersService.getGameHistory(id, dto);
  }
}

// ── 管理者専用コントローラー ──────────────────────────────────
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: '[ADMIN] 全ユーザー一覧' })
  adminGetUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.usersService.adminGetUsers(page, limit);
  }

  @Patch(':id/role')
  @Roles('ADMIN')
  @ApiOperation({ summary: '[ADMIN] ユーザーロール変更' })
  adminUpdateRole(@Param('id') id: string, @Body() body: { role: any }) {
    return this.usersService.adminUpdateRole(id, body.role);
  }

  @Post(':id/ban')
  @Roles('ADMIN', 'MODERATOR')
  @ApiOperation({ summary: '[ADMIN/MOD] ユーザーBAN' })
  adminBanUser(@Param('id') id: string, @Body() dto: BanUserDto) {
    return this.usersService.adminBanUser(id, dto);
  }

  @Delete(':id/ban')
  @Roles('ADMIN', 'MODERATOR')
  @ApiOperation({ summary: '[ADMIN/MOD] BAN解除' })
  adminUnbanUser(@Param('id') id: string) {
    return this.usersService.adminUnbanUser(id);
  }
}
