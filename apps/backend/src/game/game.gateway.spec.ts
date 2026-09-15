import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { ChatService } from '../chat/chat.service';
import { AiAgentService } from './engine/ai-agent.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GameGateway', () => {
  let gateway: GameGateway;
  let chatService: {
    assertCanAccessRoom: jest.Mock;
    saveMessage: jest.Mock;
  };

  beforeEach(async () => {
    chatService = {
      assertCanAccessRoom: jest.fn(),
      saveMessage: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        { provide: GameService, useValue: {} },
        { provide: ChatService, useValue: chatService },
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

  it('does not join a chat room when the user is not a member', async () => {
    chatService.assertCanAccessRoom.mockRejectedValue(new Error('forbidden'));
    const client: any = {
      id: 'socket-1',
      data: { userId: 'user-1' },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
    };

    await gateway.handleJoinChatRoom(client, { roomId: 'private-room' });

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('does not save or broadcast chat messages from an unauthenticated socket', async () => {
    const emit = jest.fn();
    const broadcast = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit: broadcast })) } as any;
    const client: any = { id: 'socket-1', data: {}, emit };

    await gateway.handleChatMessage(client, {
      roomId: 'global-room',
      content: 'hello',
    });

    expect(chatService.saveMessage).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('does not broadcast a message when room authorization fails', async () => {
    chatService.saveMessage.mockRejectedValue(new Error('forbidden'));
    (gateway as any).logger.error = jest.fn();
    const broadcast = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit: broadcast })) } as any;
    const client: any = {
      id: 'socket-1',
      data: { userId: 'intruder' },
      emit: jest.fn(),
    };

    await gateway.handleChatMessage(client, {
      roomId: 'private-room',
      content: 'secret',
    });

    expect(broadcast).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: expect.any(String) }),
    );
  });
});
