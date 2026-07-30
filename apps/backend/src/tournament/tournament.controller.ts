import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TournamentService } from './tournament.service';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Tournament')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('tournaments')
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Post()
  @ApiOperation({ summary: 'トーナメントを作成' })
  createTournament(
    @CurrentUser() user: any,
    @Body()
    body: {
      name: string;
      description?: string;
      maxPlayers: 4 | 8 | 16;
      registrationDeadline?: string;
    },
  ) {
    return this.tournamentService.createTournament(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'トーナメント一覧' })
  listTournaments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.tournamentService.listTournaments(page, limit);
  }

  @Get(':id/bracket')
  @ApiOperation({ summary: 'トーナメントブラケット取得' })
  getBracket(@Param('id') id: string) {
    return this.tournamentService.getTournamentBracket(id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'トーナメントに参加登録' })
  joinTournament(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tournamentService.joinTournament(id, user.id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'トーナメントを開始（作成者のみ）' })
  startTournament(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tournamentService.startTournament(id, user.id);
  }
}
