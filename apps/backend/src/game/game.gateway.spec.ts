import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { ChatService } from '../chat/chat.service';
import { AiAgentService } from './engine/ai-agent.service';
import { PrismaService } from '../prisma/prisma.service';

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
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
  });

  it('requires a valid room and piece identity for human network input', () => {
    const room = { isAiMatch: false, applyInput: jest.fn() };
    (gateway as any).rooms.set('room', room);
    (gateway as any).clientRoom.set('a', 'room');
    const client: any = { id: 'a' };
    gateway.handleHardDrop(client);
    gateway.handleHardDrop(client, { roomId: 'old', pieceId: 7 });
    gateway.handleHardDrop(client, { roomId: 'room', pieceId: NaN });
    expect(room.applyInput).not.toHaveBeenCalled();
    gateway.handleHardDrop(client, { roomId: 'room', pieceId: 7 });
    expect(room.applyInput).toHaveBeenCalledWith('a', 'game:hard_drop', 7);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('switches spectator streams before sending the new snapshot', () => {
    const old = {
      isActive: () => true,
      getPlayers: () => new Map(),
      removeSpectator: jest.fn(),
    };
    const next = { addSpectator: jest.fn(), broadcastSnapshot: jest.fn() };
    (gateway as any).rooms.set('old', old);
    (gateway as any).rooms.set('next', next);
    (gateway as any).clientGameRoom.set('viewer', 'old');
    const client: any = {
      id: 'viewer',
      leave: jest.fn(),
      join: jest.fn(),
      emit: jest.fn(),
    };
    gateway.handleSpectate(client, { roomId: 'next' });
    expect(old.removeSpectator).toHaveBeenCalledWith('viewer');
    expect(client.leave).toHaveBeenCalledWith('old');
    expect(client.emit).toHaveBeenCalledWith('spectating', { roomId: 'next' });
    expect(next.broadcastSnapshot).toHaveBeenCalled();
    expect(client.emit.mock.invocationCallOrder[0]).toBeLessThan(
      next.broadcastSnapshot.mock.invocationCallOrder[0],
    );
  });

  it('rejects browser-authored boards for human matches', () => {
    (gateway as any).clientRoom.set('a', 'room');
    (gateway as any).rooms.set('room', { isAiMatch: false });
    const client: any = { id: 'a', to: jest.fn() };
    gateway.handleBoardUpdate(client, { stage: [], score: 999 });
    expect(client.to).not.toHaveBeenCalled();
  });
});
