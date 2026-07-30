import { Module } from '@nestjs/common';
import { TournamentService } from './tournament.service';
import { TournamentController } from './tournament.controller';

@Module({
  providers: [TournamentService],
  controllers: [TournamentController],
  exports: [TournamentService],
})
export class TournamentModule {}
