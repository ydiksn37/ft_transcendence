import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { ChatService } from '../chat/chat.service';
import { AiAgentService } from './engine/ai-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentService } from '../tournament/tournament.service';

describe('WebSocket JWT authentication and chat authorization (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let baseUrl: string;
  const sockets: Socket[] = [];
  const allowedRoom = '00000000-0000-4000-8000-000000000010';
  const deniedRoom = '00000000-0000-4000-8000-000000000011';
  const assertCanAccessRoom = jest.fn(
    async (roomId: string, userId: string) => {
      if (roomId !== allowedRoom || userId !== 'user-1') throw new Error();
    },
  );
  const tournamentService = {
    createLiveTournament: jest.fn(
      async (
        _name: string,
        _ownerId: string,
        _participantIds: string[],
        matches: Array<{ clientMatchId: string }>,
      ) => ({
        tournamentId: 'tournament-e2e',
        matchIds: Object.fromEntries(
          matches.map((match) => [
            match.clientMatchId,
            `db-${match.clientMatchId}`,
          ]),
        ),
      }),
    ),
    markLiveMatchStarted: jest.fn().mockResolvedValue(undefined),
    completeLiveMatch: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'websocket-auth-e2e-secret' })],
      providers: [
        GameGateway,
        {
          provide: GameService,
          useValue: {
            saveResult: jest.fn().mockResolvedValue({ id: 'game-e2e' }),
          },
        },
        {
          provide: ChatService,
          useValue: { assertCanAccessRoom, saveMessage: jest.fn() },
        },
        { provide: AiAgentService, useValue: { releaseMatch: jest.fn() } },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async () => ({ username: 'authenticated-player' }),
              update: async () => ({}),
            },
          },
        },
        { provide: TournamentService, useValue: tournamentService },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const connect = (token?: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(baseUrl, {
        transports: ['websocket'],
        forceNew: true,
        auth: token ? { token } : {},
      });
      sockets.push(socket);
      const timer = setTimeout(
        () => reject(new Error('connect timeout')),
        3000,
      );
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

  const errorFrom = (socket: Socket) =>
    new Promise<{ code?: string; message?: string }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('error event timeout')),
        3000,
      );
      socket.once('error', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const eventFrom = <T>(
    socket: Socket,
    event: string,
    predicate: (payload: T) => boolean = () => true,
  ) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${event} event timeout`)),
        3000,
      );
      const handler = (payload: T) => {
        if (!predicate(payload)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      };
      socket.on(event, handler);
    });

  it('rejects chat access when the socket has no valid JWT identity', async () => {
    for (const token of [undefined, 'invalid-token']) {
      const socket = await connect(token);
      const error = errorFrom(socket);
      socket.emit('chat:join', { roomId: allowedRoom });
      await expect(error).resolves.toMatchObject({
        message: 'チャットには認証が必要です',
      });
      socket.disconnect();
    }
    expect(assertCanAccessRoom).not.toHaveBeenCalled();
  });

  it('uses the verified JWT subject and enforces room membership', async () => {
    const token = jwt.sign({
      sub: 'user-1',
      email: 'player@example.com',
      role: 'USER',
    });
    const socket = await connect(token);
    socket.emit('chat:join', { roomId: allowedRoom });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(assertCanAccessRoom).toHaveBeenCalledWith(allowedRoom, 'user-1');

    const error = errorFrom(socket);
    socket.emit('chat:join', { roomId: deniedRoom });
    await expect(error).resolves.toMatchObject({
      message: 'チャットルームへのアクセス権がありません',
    });
    expect(assertCanAccessRoom).toHaveBeenCalledWith(deniedRoom, 'user-1');
    socket.disconnect();
  });

  it('runs a four-user tournament round and attaches an outside spectator', async () => {
    const players = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        connect(
          jwt.sign({
            sub: `tournament-user-${index + 1}`,
            email: `player${index + 1}@example.com`,
            role: 'USER',
          }),
        ),
      ),
    );
    const owner = players[0];
    const created = eventFrom<{ roomId: string }>(owner, 'custom_room_created');
    owner.emit('game:create_custom_room', { name: 'Tournament E2E' });
    const { roomId } = await created;

    for (const [index, player] of players.slice(1).entries()) {
      const joined = eventFrom<{ roomId: string; players: unknown[] }>(
        player,
        'custom_room_state',
        (payload) =>
          payload.roomId === roomId && payload.players.length === index + 2,
      );
      player.emit('game:join_custom_room', { roomId });
      await joined;
    }

    const tournamentState = eventFrom<{ tournament?: unknown }>(
      owner,
      'tournament_state',
      (payload) => !!payload.tournament,
    );
    owner.emit('game:create_tournament');
    await tournamentState;
    expect(tournamentService.createLiveTournament).toHaveBeenCalledWith(
      'Tournament E2E',
      'tournament-user-1',
      expect.arrayContaining([
        'tournament-user-1',
        'tournament-user-2',
        'tournament-user-3',
        'tournament-user-4',
      ]),
      expect.any(Array),
    );

    const matches = players.map((player) =>
      eventFrom<{ roomId: string; players: string[] }>(player, 'match:found'),
    );
    owner.emit('game:start_tournament_match');
    const found = await Promise.all(matches);
    expect(found.every((match) => match.players.length === 2)).toBe(true);
    expect(new Set(found.map((match) => match.roomId)).size).toBe(2);

    const outsider = await connect(
      jwt.sign({
        sub: 'tournament-spectator',
        email: 'spectator@example.com',
        role: 'USER',
      }),
    );
    const spectating = eventFrom<{ roomId: string; players: string[] }>(
      outsider,
      'spectating',
      (payload) => payload.roomId.startsWith(`${roomId}_`),
    );
    const board = eventFrom(outsider, 'game:opponent');
    outsider.emit('room:spectate', { roomId });
    const [spectatorState] = await Promise.all([spectating, board]);
    expect(spectatorState.players).toHaveLength(2);

    outsider.disconnect();
    players.forEach((player) => player.disconnect());
  });
});
