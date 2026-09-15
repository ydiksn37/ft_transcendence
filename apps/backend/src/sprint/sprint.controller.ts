import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SprintService } from './sprint.service';
import { SaveSprintDto } from './dto/save-sprint.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
// TODO: Ensure JwtAuthGuard is imported correctly based on your auth module
// Assuming standard Passport JWT Guard setup in this project
import { AuthGuard } from '@nestjs/passport';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthenticatedRequest } from '../auth/decorators/current-user.decorator';

@ApiTags('Sprint (40 Lines)')
@Controller('sprint')
export class SprintController {
  constructor(private readonly sprintService: SprintService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '40 Linesの記録を保存' })
  @ApiResponse({ status: 201, description: '記録が保存されました。' })
  async saveRecord(
    @Body() dto: SaveSprintDto,
    @Request() req: AuthenticatedRequest,
  ) {
    // req.user へのアクセスは、プロジェクトの AuthStrategy の payload 設計に依存します。
    // 一般的に req.user.id に userId が入ります。
    return this.sprintService.saveRecord(req.user.id, dto);
  }

  @Public()
  @Get('leaderboard')
  @ApiOperation({ summary: 'グローバルランキングを取得 (Top 10)' })
  @ApiResponse({ status: 200, description: 'ランキングデータを返します。' })
  async getGlobalLeaderboard() {
    return this.sprintService.getGlobalLeaderboard(10);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '自分の記録ランキングを取得 (Top 10)' })
  @ApiResponse({
    status: 200,
    description: '個人のランキングデータを返します。',
  })
  async getMyRecords(@Request() req: AuthenticatedRequest) {
    return this.sprintService.getMyRecords(req.user.id, 10);
  }
}
