import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TournamentService } from './tournament.service';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  CreateTournamentDto,
  TournamentListQueryDto,
} from './dto/tournament.dto';

@ApiTags('Tournament')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('tournaments')
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Post()
  @ApiOperation({ summary: 'トーナメントを作成' })
  createTournament(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateTournamentDto,
  ) {
    return this.tournamentService.createTournament(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'トーナメント一覧' })
  listTournaments(@Query() query: TournamentListQueryDto) {
    return this.tournamentService.listTournaments(query.page, query.limit);
  }

  @Get(':id/bracket')
  @ApiOperation({ summary: 'トーナメントブラケット取得' })
  getBracket(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentService.getTournamentBracket(id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'トーナメントに参加登録' })
  joinTournament(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentService.joinTournament(id, user.id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'トーナメントを開始（作成者のみ）' })
  startTournament(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentService.startTournament(id, user.id);
  }
}
