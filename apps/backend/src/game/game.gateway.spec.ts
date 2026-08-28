import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { ChatService } from '../chat/chat.service';
import { AiAgentService } from './engine/ai-agent.service';

describe('GameGateway', () => {
  let gateway: GameGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        { provide: GameService, useValue: {} },
        { provide: ChatService, useValue: {} },
        { provide: AiAgentService, useValue: {} },
        { provide: JwtService, useValue: { verify: jest.fn() } },
      ],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
