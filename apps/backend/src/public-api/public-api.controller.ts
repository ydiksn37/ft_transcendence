import {
  Controller,
  Get,
  Post,
  Put,
  Req,
  HttpCode,
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
  ApiBody,
} from '@nestjs/swagger';
import { ApiKeyGuard } from './guards/api-key.guard';
import { GameMode, Rank, TournamentStatus } from '@prisma/client';
import {
  leaderboardResponse,
  profileResponse,
  statsResponse,
  historyResponse,
  tournamentsResponse,
  settingsResponse,
} from './public-api.schemas';
import {
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  conflictResponse,
  quotaResponse,
  createdKeyResponse,
  keysResponse,
  revokedKeyResponse,
  errorResponse,
} from './public-api.schemas';
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
  PublicGameSettingsDto,
} from './dto/public-api.dto';

// ── Public API コントローラー (APIキー認証) ───────────────────────
@ApiTags('Public API')
@ApiSecurity('api-key')
@ApiResponse({
  status: 401,
  description:
    'Missing, invalid, revoked or expired X-API-Key; disabled owner.',
  schema: unauthorizedResponse,
})
@ApiResponse({
  status: 429,
  description:
    'Hourly key quota exceeded. Response includes retryAfter in seconds.',
  schema: quotaResponse,
})
@ApiResponse({
  status: 400,
  description: 'Invalid path, query or body; unknown fields are rejected.',
  schema: badRequestResponse,
})
@ApiResponse({
  status: 404,
  description: 'Requested user or saved resource does not exist.',
  schema: notFoundResponse,
})
@Public()
@UseGuards(ApiKeyGuard)
@Controller('public')
export class PublicApiController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get('me/settings')
  @ApiOperation({ summary: 'Get the API key owner game preferences' })
  @ApiResponse({
    status: 200,
    description: 'Saved preferences, including ID, userId and timestamps.',
    schema: settingsResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'No saved preferences exist.',
    schema: notFoundResponse,
  })
  getSettings(@Req() request: { apiKeyRecord: { userId: string } }) {
    return this.publicApiService.getSettings(request.apiKeyRecord.userId);
  }

  @Post('me/settings')
  @ApiBody({
    type: PublicGameSettingsDto,
    examples: {
      preferences: {
        value: {
          minoSkin: 'NEON',
          showGhost: true,
          arr: 33,
          das: 170,
          sdf: 6,
          volume: 50,
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Create the API key owner game preferences',
    description:
      'Omitted/null fields use defaults. Example: {"showGhost":true,"arr":33,"das":170,"sdf":6}. Only the key owner is writable.',
  })
  @ApiResponse({
    status: 201,
    description: 'Saved preferences created.',
    schema: settingsResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Unknown field, invalid type or out-of-range preference.',
    schema: badRequestResponse,
  })
  @ApiResponse({
    status: 409,
    description: 'Preferences already exist; use PUT.',
    schema: conflictResponse,
  })
  createSettings(
    @Req() request: { apiKeyRecord: { userId: string } },
    @Body() dto: PublicGameSettingsDto,
  ) {
    return this.publicApiService.createSettings(
      request.apiKeyRecord.userId,
      dto,
    );
  }

  @Put('me/settings')
  @ApiBody({
    type: PublicGameSettingsDto,
    examples: {
      replace: { value: { showGhost: false, volume: 25 } },
      reset: { value: {} },
    },
  })
  @ApiOperation({
    summary: 'Replace the API key owner game preferences',
    description:
      'Full replacement, not a patch. Omitted/null fields reset to defaults; keyBindings resets to null. Does not change authoritative match rules.',
  })
  @ApiResponse({
    status: 200,
    description: 'Saved preferences replaced.',
    schema: settingsResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid preference payload.',
    schema: badRequestResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'No preferences exist; use POST.',
    schema: notFoundResponse,
  })
  replaceSettings(
    @Req() request: { apiKeyRecord: { userId: string } },
    @Body() dto: PublicGameSettingsDto,
  ) {
    return this.publicApiService.replaceSettings(
      request.apiKeyRecord.userId,
      dto,
    );
  }

  @Delete('me/settings')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete the API key owner saved preferences',
    description:
      'Idempotent. Does not delete the account, matches or other users preferences.',
  })
  @ApiResponse({
    status: 204,
    description: 'Saved preferences removed (or already absent).',
  })
  deleteSettings(@Req() request: { apiKeyRecord: { userId: string } }) {
    return this.publicApiService.deleteSettings(request.apiKeyRecord.userId);
  }

  /** エンドポイント 1: グローバルランキング */
  @Get('leaderboard')
  @ApiResponse({
    status: 200,
    description:
      'Ranking page. Decimal statistics are strings; stats can be null.',
    schema: leaderboardResponse,
  })
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
    enum: Rank,
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
  @ApiResponse({
    status: 200,
    description: 'Public profile; no email, credentials or 2FA secret.',
    schema: profileResponse,
  })
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
  @ApiResponse({
    status: 200,
    description: 'User statistics. Decimal values are strings.',
    schema: statsResponse,
  })
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
  @ApiResponse({
    status: 200,
    description:
      'Match history page. Deleted participants and absent winners can be null.',
    schema: historyResponse,
  })
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
    enum: GameMode,
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
  @ApiResponse({
    status: 200,
    description:
      'Tournament page including entry counts and nullable lifecycle dates.',
    schema: tournamentsResponse,
  })
  @ApiOperation({
    summary: '[Public] トーナメント一覧取得',
    description: '開催中・完了済みトーナメントの一覧。',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TournamentStatus,
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
@ApiResponse({
  status: 401,
  description:
    'A valid login access token is required; API keys cannot manage keys.',
  schema: errorResponse(401, 'Unauthorized', 'Unauthorized'),
})
@ApiResponse({
  status: 400,
  description: 'Invalid UUID or issuance payload.',
  schema: badRequestResponse,
})
@Controller('keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({ summary: 'APIキーを新規発行' })
  @ApiBody({
    type: CreateApiKeyDto,
    examples: {
      integration: { value: { label: 'My integration', rateLimit: 1000 } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'New API key. Raw secret is returned only once.',
    schema: createdKeyResponse,
  })
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
  @ApiResponse({
    status: 200,
    description:
      'Owner keys, including revoked keys; excludes raw keys and hashes.',
    schema: keysResponse,
  })
  listApiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.apiKeyService.listApiKeys(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'APIキーを無効化' })
  @ApiResponse({
    status: 200,
    description: 'Owned key revoked; repeating revocation also succeeds.',
    schema: revokedKeyResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'Key does not exist or is owned by another user.',
    schema: notFoundResponse,
  })
  revokeApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ApiKeyIdParamDto,
  ) {
    return this.apiKeyService.revokeApiKey(user.id, params.id);
  }
}
