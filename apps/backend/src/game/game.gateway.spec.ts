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

  it('accepts AI READY only for the socket current room', () => {
    const room = { confirmAiReady: jest.fn() };
    (gateway as any).rooms.set('current', room);
    (gateway as any).clientRoom.set('human', 'current');
    gateway.handleAiReady({ id: 'human' } as any, { roomId: 'old' });
    gateway.handleAiReady({ id: 'spectator' } as any, { roomId: 'current' });
    gateway.handleAiReady({ id: 'human' } as any, undefined as any);
    expect(room.confirmAiReady).not.toHaveBeenCalled();
    gateway.handleAiReady({ id: 'human' } as any, { roomId: 'current' });
    expect(room.confirmAiReady).toHaveBeenCalledTimes(1);
    expect(room.confirmAiReady).toHaveBeenCalledWith('human');
  });

  it('acknowledges an intentional forfeit after ending the match', async () => {
    const room = {
      isAiMatch: false,
      handleGameOver: jest.fn().mockResolvedValue(undefined),
    };
    (gateway as any).rooms.set('room', room);
    (gateway as any).clientRoom.set('player', 'room');

    await expect(
      gateway.handleGameOverEvent({ id: 'player' } as any),
    ).resolves.toEqual({ ok: true });
    expect(room.handleGameOver).toHaveBeenCalledWith('player');
  });

  it('issues independent guest sessions and restores only the matching player', async () => {
    jest.useFakeTimers();
    const sockets = new Map<string, any>();
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
      sockets,
    } as any;
    const makeClient = (id: string, auth: Record<string, unknown>) => {
      const client: any = {
        id,
        connected: true,
        disconnected: false,
        data: {},
        handshake: { auth },
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
      };
      sockets.set(id, client);
      return client;
    };

    const first = makeClient('guest-a-old', { guestGameSession: true });
    const other = makeClient('guest-b', { guestGameSession: true });
    await gateway.handleConnection(first);
    await gateway.handleConnection(other);
    jest.advanceTimersByTime(0);

    const firstSession = first.emit.mock.calls.find(
      ([event]: [string]) => event === 'session:ready',
    )?.[1];
    const otherSession = other.emit.mock.calls.find(
      ([event]: [string]) => event === 'session:ready',
    )?.[1];
    expect(firstSession.guestSessionId).not.toBe(
      otherSession.guestSessionId,
    );
    expect(firstSession.reconnectToken).not.toBe(
      otherSession.reconnectToken,
    );

    const player = { socketId: first.id, isGameOver: false };
    const players = new Map([[first.id, player]]);
    const room = {
      roomId: 'match-room',
      gameSeed: 42,
      isStarted: true,
      isAiMatch: false,
      getPlayers: jest.fn(() => players),
      rebindSocket: jest.fn((oldId: string, newId: string) => {
        const state = players.get(oldId);
        if (!state) return false;
        players.delete(oldId);
        state.socketId = newId;
        players.set(newId, state);
        return true;
      }),
      broadcastSnapshot: jest.fn(),
      handleGameOver: jest.fn(),
    };
    (gateway as any).rooms.set('match-room', room);
    (gateway as any).clientRoom.set(first.id, 'match-room');
    first.connected = false;
    first.disconnected = true;
    sockets.delete(first.id);
    await gateway.handleDisconnect(first);

    const resumed = makeClient('guest-a-new', {
      guestGameSession: true,
      guestSessionId: firstSession.guestSessionId,
      reconnectToken: firstSession.reconnectToken,
    });
    await gateway.handleConnection(resumed);

    expect(room.rebindSocket).toHaveBeenCalledWith(
      'guest-a-old',
      'guest-a-new',
    );
    expect((gateway as any).clientRoom.get('guest-a-new')).toBe('match-room');
    expect((gateway as any).clientRoom.has('guest-a-old')).toBe(false);
    expect(room.handleGameOver).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(
      resumed.emit.mock.calls.find(
        ([event]: [string]) => event === 'session:ready',
      )?.[1].resumed,
    ).toBe(true);
    jest.useRealTimers();
  });

  it('restores an authenticated player only with the matching account session', async () => {
    jest.useFakeTimers();
    const sockets = new Map<string, any>();
    gateway.server = {
      emit: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() })),
      sockets,
    } as any;
    (gateway as any).jwtService.verify = jest.fn(() => ({ sub: 'user-1' }));
    (gateway as any).prisma.user = {
      findUnique: jest.fn().mockResolvedValue({ username: 'alice' }),
      update: jest.fn().mockResolvedValue({}),
    };
    const makeClient = (id: string, auth: Record<string, unknown>) => {
      const client: any = {
        id,
        connected: true,
        disconnected: false,
        data: {},
        handshake: { auth },
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
      };
      sockets.set(id, client);
      return client;
    };

    const original = makeClient('user-old', {
      token: 'valid-jwt',
      guestGameSession: true,
    });
    await gateway.handleConnection(original);
    jest.advanceTimersByTime(0);
    const session = original.emit.mock.calls.find(
      ([event]: [string]) => event === 'session:ready',
    )?.[1];
    expect(session).toMatchObject({ displayName: 'alice', resumed: false });

    const player = { socketId: original.id, isGameOver: false };
    const players = new Map([[original.id, player]]);
    const room = {
      roomId: 'authenticated-match',
      gameSeed: 7,
      isStarted: true,
      isAiMatch: false,
      getPlayers: jest.fn(() => players),
      rebindSocket: jest.fn((oldId: string, newId: string) => {
        const state = players.get(oldId);
        if (!state) return false;
        players.delete(oldId);
        state.socketId = newId;
        players.set(newId, state);
        return true;
      }),
      broadcastSnapshot: jest.fn(),
      handleGameOver: jest.fn(),
    };
    (gateway as any).rooms.set(room.roomId, room);
    (gateway as any).clientRoom.set(original.id, room.roomId);
    original.connected = false;
    original.disconnected = true;
    sockets.delete(original.id);
    await gateway.handleDisconnect(original);

    (gateway as any).jwtService.verify.mockReturnValueOnce({ sub: 'user-2' });
    const wrongAccount = makeClient('wrong-account', {
      token: 'other-valid-jwt',
      guestGameSession: true,
      guestSessionId: session.guestSessionId,
      reconnectToken: session.reconnectToken,
    });
    await gateway.handleConnection(wrongAccount);
    jest.advanceTimersByTime(0);
    expect(
      wrongAccount.emit.mock.calls.find(
        ([event]: [string]) => event === 'session:ready',
      )?.[1].resumed,
    ).toBe(false);
    expect(room.rebindSocket).not.toHaveBeenCalled();

    const resumed = makeClient('user-new', {
      token: 'valid-jwt',
      guestGameSession: true,
      guestSessionId: session.guestSessionId,
      reconnectToken: session.reconnectToken,
    });
    await gateway.handleConnection(resumed);
    jest.advanceTimersByTime(0);

    expect(room.rebindSocket).toHaveBeenCalledWith('user-old', 'user-new');
    expect(room.handleGameOver).not.toHaveBeenCalled();
    expect(
      resumed.emit.mock.calls.find(
        ([event]: [string]) => event === 'session:ready',
      )?.[1],
    ).toMatchObject({ displayName: 'alice', resumed: true });
    jest.useRealTimers();
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
