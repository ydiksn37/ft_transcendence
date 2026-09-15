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
  ParseUUIDPipe,
  ParseFilePipeBuilder,
  HttpCode,
  HttpStatus,
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
import {
  UpdateUserDto,
  SearchUsersDto,
  BanUserDto,
  SearchHistoryDto,
  UpdateGameSettingsDto,
  UpdateUserRoleDto,
  AdminUsersQueryDto,
  FriendRequestDto,
  RespondFriendRequestDto,
  RequestAccountDeletionDto,
  ConfirmAccountDeletionDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: '自分のプロフィール取得' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'プロフィール更新' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Patch('me/settings')
  @ApiOperation({ summary: 'ゲーム設定を更新する' })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateGameSettingsDto,
  ) {
    return this.usersService.updateGameSettings(user.id, dto);
  }

  @Post('me/deletion-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '本人確認後、アカウント削除確認コードをメール送信' })
  requestAccountDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestAccountDeletionDto,
  ) {
    return this.usersService.requestAccountDeletion(user.id, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: '確認コードを検証してアカウントを完全削除' })
  deleteMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmAccountDeletionDto,
  ) {
    return this.usersService.deleteMe(user.id, dto);
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
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^image\/(jpeg|png|gif|webp)$/ })
        .addMaxSizeValidator({ maxSize: 2 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    const avatarUrl = `/uploads/${file.filename}`;
    return this.usersService.updateAvatar(user.id, avatarUrl, {
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'ユーザー検索（ページネーション付き）' })
  searchUsers(@Query() dto: SearchUsersDto) {
    return this.usersService.searchUsers(dto);
  }

  @Get('friends')
  @ApiOperation({ summary: 'フレンド一覧取得' })
  getFriends(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getFriends(user.id);
  }

  @Post('friends/request')
  @ApiOperation({ summary: 'フレンド申請を送る' })
  sendFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: FriendRequestDto,
  ) {
    return this.usersService.sendFriendRequest(user.id, body);
  }

  @Patch('friends/:id')
  @ApiOperation({ summary: 'フレンド申請を承認/拒否' })
  respondFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RespondFriendRequestDto,
  ) {
    return this.usersService.respondFriendRequest(user.id, id, body.accept);
  }

  @Delete('friends/:id')
  @ApiOperation({ summary: 'フレンドを削除' })
  removeFriend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.removeFriend(user.id, id);
  }

  @Post('block/:id')
  @ApiOperation({ summary: 'ユーザーをブロック' })
  blockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.blockUser(user.id, id);
  }

  @Delete('block/:id')
  @ApiOperation({ summary: 'ブロックを解除' })
  unblockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.unblockUser(user.id, id);
  }

  @Get('me/stats')
  @ApiOperation({ summary: '自分のゲーム統計取得（APM/PPS/勝率等）' })
  getMyStats(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getUserStats(user.id);
  }

  @Get('me/history')
  @ApiOperation({ summary: '自分の対戦履歴取得' })
  getMyHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: SearchHistoryDto,
  ) {
    return this.usersService.getGameHistory(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ユーザープロフィール取得' })
  getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'ゲーム統計取得（APM/PPS/勝率等）' })
  getUserStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserStats(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: '対戦履歴取得' })
  getGameHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: SearchHistoryDto,
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
  @Roles('ADMIN', 'MODERATOR')
  @ApiOperation({ summary: '[ADMIN/MOD] 全ユーザー一覧' })
  adminGetUsers(@Query() query: AdminUsersQueryDto) {
    return this.usersService.adminGetUsers(query.page, query.limit);
  }

  @Patch(':id/role')
  @Roles('ADMIN')
  @ApiOperation({ summary: '[ADMIN] ユーザーロール変更' })
  adminUpdateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.adminUpdateRole(id, dto.role);
  }

  @Post(':id/ban')
  @Roles('ADMIN', 'MODERATOR')
  @ApiOperation({ summary: '[ADMIN/MOD] ユーザーBAN' })
  adminBanUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BanUserDto,
  ) {
    return this.usersService.adminBanUser(id, dto);
  }

  @Delete(':id/ban')
  @Roles('ADMIN', 'MODERATOR')
  @ApiOperation({ summary: '[ADMIN/MOD] BAN解除' })
  adminUnbanUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.adminUnbanUser(id);
  }
}
