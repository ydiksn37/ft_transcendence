import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
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

@ApiTags('Data Export/Import')
@Controller('users/me/export')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('download')
  @ApiOperation({ summary: '自分の全データをエクスポート (JSON)' })
  @ApiResponse({ status: 200, description: '全データを含むJSONを返します。' })
  async downloadExportData(@Request() req: AuthenticatedRequest) {
    const data = await this.exportService.exportUserData(req.user.id);
    return data;
  }

  @Post('import')
  @ApiOperation({ summary: '設定をインポート (JSON)' })
  @ApiResponse({ status: 200, description: 'インポートした設定を保存します。' })
  async importSettings(
    @Request() req: AuthenticatedRequest,
    @Body() body: ImportUserSettingsDto,
  ) {
    return this.exportService.importUserSettings(req.user.id, body.settings);
  }
}
