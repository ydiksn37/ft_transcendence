import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsQueryDto } from './dto/analytics.dto';
import type { AuthenticatedRequest } from '../auth/decorators/current-user.decorator';

@ApiTags('Analytics')
@Controller('users/me/analytics')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: '過去のゲーム統計（APM/PPS推移など）を取得' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: '取得する日数 (デフォルト: 30)',
  })
  @ApiResponse({
    status: 200,
    description: '日次アナリティクスデータを返します。',
  })
  async getMyAnalytics(
    @Request() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getMyAnalytics(req.user.id, query.days);
  }
}
