import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
  Query,
  Res,
  HttpCode,
} from '@nestjs/common';
import { ExportService } from './export.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ImportUserSettingsDto } from './dto/user.dto';
import type { AuthenticatedRequest } from '../auth/decorators/current-user.decorator';
import type { Response } from 'express';
import { ExportQueryDto } from './dto/export.dto';
import { accountExportCsv } from './export-csv';

@ApiTags('Data Export/Import')
@Controller('users/me/export')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('download')
  @ApiOperation({ summary: '自分のデータをJSON/CSVで一括エクスポート' })
  @ApiResponse({ status: 200, description: '全データを含むJSONを返します。' })
  async downloadExportData(
    @Request() req: AuthenticatedRequest,
    @Query() query: ExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const data = await this.exportService.exportUserData(req.user.id);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="my_data.${query.format}"`,
    );
    if (query.format === 'csv') {
      response.type('text/csv; charset=utf-8');
      return accountExportCsv(data);
    }
    return data;
  }

  @Post('import')
  @HttpCode(200)
  @ApiOperation({ summary: '設定をインポート (JSON)' })
  @ApiResponse({ status: 200, description: 'インポートした設定を保存します。' })
  async importSettings(
    @Request() req: AuthenticatedRequest,
    @Body() body: ImportUserSettingsDto,
  ) {
    return this.exportService.importUserSettings(req.user.id, body.settings);
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary: '設定インポートを検証し変更予定を返す（保存しない）',
  })
  async previewSettings(
    @Request() req: AuthenticatedRequest,
    @Body() body: ImportUserSettingsDto,
  ) {
    return this.exportService.previewUserSettings(req.user.id, body.settings);
  }
}
