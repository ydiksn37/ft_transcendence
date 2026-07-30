import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
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
import { Public } from '../auth/decorators/public.decorator';

// ── Public API コントローラー (APIキー認証) ───────────────────────
@ApiTags('Public API')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('public')
export class PublicApiController {
  constructor(private readonly publicApiService: PublicApiService) {}

  /** エンドポイント 1: グローバルランキング */
  @Get('leaderboard')
  @ApiOperation({
    summary: '[Public] グローバルランキング取得',
    description: 'ランクポイント順のユーザーランキング。ページネーション・ランクフィルター対応。',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'rank', required: false, enum: ['BRONZE','SILVER','GOLD','PLATINUM','DIAMOND','MASTER'] })
  getLeaderboard(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('rank') rank?: string,
  ) {
    return this.publicApiService.getLeaderboard(page, limit, rank);
  }

  /** エンドポイント 2: ユーザープロフィール */
  @Get('users/:username')
  @ApiOperation({
    summary: '[Public] ユーザープロフィール取得',
    description: 'ユーザー名からプロフィールを取得。機密情報は除外。',
  })
  async getUserByUsername(@Param('username') username: string) {
    const user = await this.publicApiService.getUserByUsername(username);
    if (!user) throw new NotFoundException('ユーザーが見つかりません');
    return user;
  }

  /** エンドポイント 3: ユーザー統計 */
  @Get('users/:username/stats')
  @ApiOperation({
    summary: '[Public] ユーザー統計取得',
    description: 'APM・PPS・勝率・ランク等の統計情報。',
  })
  async getUserStats(@Param('username') username: string) {
    const stats = await this.publicApiService.getUserStats(username);
    if (!stats) throw new NotFoundException('ユーザーが見つかりません');
    return stats;
  }

  /** エンドポイント 4: 対戦履歴 */
  @Get('users/:username/history')
  @ApiOperation({
    summary: '[Public] 対戦履歴取得',
    description: '最新の対戦結果。ページネーション・ゲームモードフィルター対応。',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'mode', required: false, enum: ['VERSUS','AI','TOURNAMENT'] })
  async getUserHistory(
    @Param('username') username: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('mode') mode?: string,
  ) {
    const result = await this.publicApiService.getUserHistory(username, page, limit, mode);
    if (!result) throw new NotFoundException('ユーザーが見つかりません');
    return result;
  }

  /** エンドポイント 5: トーナメント一覧 */
  @Get('tournaments')
  @ApiOperation({
    summary: '[Public] トーナメント一覧取得',
    description: '開催中・完了済みトーナメントの一覧。',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['REGISTRATION','IN_PROGRESS','COMPLETED'] })
  getTournaments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.publicApiService.getTournaments(page, limit, status);
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
    @CurrentUser() user: any,
    @Body() body: { label: string; rateLimit?: number; expiresAt?: string },
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
  listApiKeys(@CurrentUser() user: any) {
    return this.apiKeyService.listApiKeys(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'APIキーを無効化' })
  revokeApiKey(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apiKeyService.revokeApiKey(user.id, id);
  }
}
