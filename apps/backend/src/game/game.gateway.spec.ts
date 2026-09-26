import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { ChatService } from '../chat/chat.service';
import { AiAgentService } from './engine/ai-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentService } from '../tournament/tournament.service';

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
        { provide: AiAgentService, useValue: { releaseMatch: jest.fn() } },
        { provide: JwtService, useValue: { verify: jest.fn() } },
        { provide: PrismaService, useValue: {} },
        { provide: TournamentService, useValue: {} },
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

  it.each([1, 3, 4])(
    'allows a four-player tournament with %s guests, including a guest owner',
    async (guestCount) => {
      const clients = Array.from({ length: 4 }, (_, i) => ({
        id: `socket-${i}`,
        data: {},
        emit: jest.fn(),
        join: jest.fn(),
      }));
      const room: any = {
        roomId: 'guest-cup',
        name: 'Guest Cup',
        ownerSocketId: clients[0].id,
        players: clients.map((socket, i) => ({
          socket,
          userId: i < guestCount ? null : `user-${i}`,
          username: null,
          wins: 0,
        })),
        isPlaying: false,
        isTournamentActive: false,
        databaseTournamentId: 'previous-cup',
        databaseMatchIds: { old: 'old' },
      };
      const persistence = jest.fn();
      (gateway as any).tournamentService.createLiveTournament = persistence;
      (gateway as any).customRooms.set(room.roomId, room);
      (gateway as any).clientRoom.set(clients[0].id, room.roomId);
      await gateway.handleCreateTournament(clients[0] as any);
      expect(persistence).not.toHaveBeenCalled();
      expect(room.databaseTournamentId).toBeUndefined();
      expect(room.databaseMatchIds).toBeUndefined();
      expect(room.isTournamentActive).toBe(true);
      expect(room.tournament.matches).toHaveLength(3);
      expect(
        room.tournament.matches.flatMap((m: any) => m.playerIds).sort(),
      ).toEqual(clients.map((c) => c.id).sort());
      clients.forEach((c) =>
        expect(c.emit).toHaveBeenCalledWith('tournament_state', {
          tournament: room.tournament,
        }),
      );
      const bracket = room.tournament;
      await gateway.handleCreateTournament(clients[0] as any);
      expect(room.tournament).toBe(bracket);
    },
  );

  it('still persists a tournament of four distinct registered accounts', async () => {
    const client: any = {
      id: 'owner',
      data: { userId: 'u0' },
      emit: jest.fn(),
    };
    const players = [
      client,
      ...[1, 2, 3].map((i) => ({ id: `s${i}`, emit: jest.fn() })),
    ].map((socket, i) => ({ socket, userId: `u${i}`, username: `P${i}` }));
    const room: any = {
      roomId: 'cup',
      name: 'Cup',
      ownerSocketId: 'owner',
      players,
    };
    const save = jest
      .fn()
      .mockResolvedValue({ tournamentId: 'db-cup', matchIds: {} });
    (gateway as any).tournamentService.createLiveTournament = save;
    (gateway as any).customRooms.set('cup', room);
    (gateway as any).clientRoom.set('owner', 'cup');
    await gateway.handleCreateTournament(client);
    expect(save).toHaveBeenCalledWith(
      'Cup',
      'u0',
      ['u0', 'u1', 'u2', 'u3'],
      expect.any(Array),
    );
    expect(room.databaseTournamentId).toBe('db-cup');
  });

  it('rejects duplicate registered accounts, not multiple null guest IDs', async () => {
    const client: any = { id: 'owner', emit: jest.fn() };
    const room: any = {
      ownerSocketId: 'owner',
      players: ['same', 'same', null, null].map((userId) => ({ userId })),
    };
    (gateway as any).customRooms.set('cup', room);
    (gateway as any).clientRoom.set('owner', 'cup');
    await gateway.handleCreateTournament(client);
    expect(client.emit).toHaveBeenCalledWith('error', {
      message: '同じアカウントでトーナメントに複数参加することはできません',
    });
    expect(room.tournament).toBeUndefined();
  });

  it('creates isolated matches for concurrent pairs without leaking queue state', () => {
    jest.useFakeTimers();
    const broadcasts: Array<{ roomId: string; event: string; payload: any }> =
      [];
    gateway.server = {
      sockets: new Map(),
      to: jest.fn((roomId: string) => ({
        emit: (event: string, payload: any) =>
          broadcasts.push({ roomId, event, payload }),
      })),
    } as any;
    const clients = ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      data: { username: id.toUpperCase() },
      join: jest.fn(),
      emit: jest.fn(),
    })) as any[];

    clients.forEach((client) => gateway.handleJoinQueue(client));

    const matches = broadcasts.filter(({ event }) => event === 'match:found');
    expect(matches).toHaveLength(2);
    expect(matches[0].roomId).not.toBe(matches[1].roomId);
    expect(new Set(matches[0].payload.players)).toEqual(new Set(['a', 'b']));
    expect(new Set(matches[1].payload.players)).toEqual(new Set(['c', 'd']));
    clients.forEach((client) => expect(client.join).toHaveBeenCalledTimes(1));
    expect((gateway as any).matchmakingQueue).toHaveLength(0);
    expect((gateway as any).rooms.size).toBe(2);
    for (const room of (gateway as any).rooms.values()) room.stop();
    jest.useRealTimers();
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
    expect(firstSession.guestSessionId).not.toBe(otherSession.guestSessionId);
    expect(firstSession.reconnectToken).not.toBe(otherSession.reconnectToken);

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
