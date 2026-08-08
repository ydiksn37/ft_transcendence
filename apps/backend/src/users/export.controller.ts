import { Controller, Post, Get, Request, UseGuards } from '@nestjs/common';
import { ExportService } from './export.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Export (GDPR)')
@Controller('users/me/export')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('download')
  @ApiOperation({ summary: '自分の全データをエクスポート (JSON)' })
  @ApiResponse({ status: 200, description: '全データを含むJSONを返します。' })
  async downloadExportData(@Request() req: any) {
    const data = await this.exportService.exportUserData(req.user.id);
    await this.exportService.recordExportRequest(req.user.id, data);
    return data;
  }
}
