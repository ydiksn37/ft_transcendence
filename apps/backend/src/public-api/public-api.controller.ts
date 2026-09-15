import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiSecurity,
  ApiBearerAuth,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ApiKeyGuard } from './guards/api-key.guard';
import { PublicApiService } from './public-api.service';
import { ApiKeyService } from './api-key.service';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  ApiKeyIdParamDto,
  CreateApiKeyDto,
  LeaderboardQueryDto,
  TournamentQueryDto,
  UserHistoryQueryDto,
  UsernameParamDto,
} from './dto/public-api.dto';

// ── Public API コントローラー (APIキー認証) ───────────────────────
@ApiTags('Public API')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@Controller('public')
export class PublicApiController {
  constructor(private readonly publicApiService: PublicApiService) {}

  /** エンドポイント 1: グローバルランキング */
  @Get('leaderboard')
  @ApiOperation({
    summary: '[Public] グローバルランキング取得',
    description:
      'ランクポイント順のユーザーランキング。ページネーション・ランクフィルター対応。',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'rank',
    required: false,
    enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER'],
  })
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.publicApiService.getLeaderboard(
      query.page,
      query.limit,
      query.rank,
    );
  }

  /** エンドポイント 2: ユーザープロフィール */
  @Get('users/:username')
  @ApiOperation({
    summary: '[Public] ユーザープロフィール取得',
    description: 'ユーザー名からプロフィールを取得。機密情報は除外。',
  })
  async getUserByUsername(@Param() params: UsernameParamDto) {
    const user = await this.publicApiService.getUserByUsername(params.username);
    if (!user) throw new NotFoundException('ユーザーが見つかりません');
    return user;
  }

  /** エンドポイント 3: ユーザー統計 */
  @Get('users/:username/stats')
  @ApiOperation({
    summary: '[Public] ユーザー統計取得',
    description: 'APM・PPS・勝率・ランク等の統計情報。',
  })
  async getUserStats(@Param() params: UsernameParamDto) {
    const stats = await this.publicApiService.getUserStats(params.username);
    if (!stats) throw new NotFoundException('ユーザーが見つかりません');
    return stats;
  }

  /** エンドポイント 4: 対戦履歴 */
  @Get('users/:username/history')
  @ApiOperation({
    summary: '[Public] 対戦履歴取得',
    description:
      '最新の対戦結果。ページネーション・ゲームモードフィルター対応。',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: ['VERSUS', 'AI', 'TOURNAMENT'],
  })
  async getUserHistory(
    @Param() params: UsernameParamDto,
    @Query() query: UserHistoryQueryDto,
  ) {
    const result = await this.publicApiService.getUserHistory(
      params.username,
      query.page,
      query.limit,
      query.mode,
    );
    if (!result) throw new NotFoundException('ユーザーが見つかりません');
    return result;
  }

  /** エンドポイント 5: トーナメント一覧 */
  @Get('tournaments')
  @ApiOperation({
    summary: '[Public] トーナメント一覧取得',
    description: '開催中・完了済みトーナメントの一覧。',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['REGISTRATION', 'IN_PROGRESS', 'COMPLETED'],
  })
  getTournaments(@Query() query: TournamentQueryDto) {
    return this.publicApiService.getTournaments(
      query.page,
      query.limit,
      query.status,
    );
  }
}

// ── APIキー管理コントローラー (JWT認証) ───────────────────────────
@ApiTags('API Keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({ summary: 'APIキーを新規発行' })
  createApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateApiKeyDto,
  ) {
    return this.apiKeyService.createApiKey(
      user.id,
      body.label,
      body.rateLimit,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
  }

  @Get()
  @ApiOperation({ summary: '自分のAPIキー一覧取得（キー本体は非表示）' })
  listApiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.apiKeyService.listApiKeys(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'APIキーを無効化' })
  revokeApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ApiKeyIdParamDto,
  ) {
    return this.apiKeyService.revokeApiKey(user.id, params.id);
  }
}
