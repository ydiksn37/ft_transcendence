import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { GameService } from './game.service';

@Controller('api/game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @UseGuards(JwtAuthGuard)
  @Post('result')
  async saveSinglePlayerResult(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    let mode = body.gameMode;
    if (mode === '40_LINES') mode = 'LINES_40';
    else if (mode !== 'MARATHON') mode = 'VERSUS';

    await this.gameService.saveResult({
      roomId: `single_${Date.now()}_${userId}`,
      player1Id: userId,
      player2Id: null,
      winnerId: userId, // Single player essentially "wins" their run to gain XP
      isAiGame: false,
      player1Apm: body.apm || 0,
      player2Apm: 0,
      player1Pps: body.pps || 0,
      player2Pps: 0,
      player1LinesCleared: body.linesCleared || 0,
      player2LinesCleared: 0,
      player1TSpins: body.tSpins || 0,
      player2TSpins: 0,
      player1Tetrises: body.tetrises || 0,
      player2Tetrises: 0,
      garbageSent1to2: 0,
      garbageSent2to1: 0,
      durationSeconds: body.durationSeconds || 0,
      gameMode: mode,
    });

    return { success: true };
  }
}
