import { Module, forwardRef } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GameController } from './game.controller';
import { ChatModule } from '../chat/chat.module';
import { AiAgentService } from './engine/ai-agent.service';
import { TournamentModule } from '../tournament/tournament.module';

@Module({
  imports: [PrismaModule, AuthModule, ChatModule, TournamentModule],
  controllers: [GameController],
  providers: [GameGateway, GameService, AiAgentService],
  exports: [GameService, AiAgentService],
})
export class GameModule {}
