import type { GameInput } from '@transcendence/shared';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { resolve } from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import {
  ClientEvent,
  ServerEvent,
  Cell,
  isAiDifficulty,
} from '@transcendence/shared';
import type {
  AiAgentModel,
  AiDifficulty,
  AiPreviewStartRequest,
} from '@transcendence/shared';
import { GameInstance } from './game-instance';
import { GameService } from './game.service';
import { ChatService } from '../chat/chat.service';
import { AiAgentService } from './engine/ai-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateTournamentBracket, Tournament } from './tournament.utils';

interface CustomRoom {
  roomId: string;
  name: string;
  ownerSocketId: string;
  players: {
    socket: Socket;
    userId: string | null;
    guestSessionId?: string | null;
    username: string | null;
    wins: number;
  }[];
  isPlaying: boolean;
  isTournamentActive?: boolean;
  tournament?: Tournament;
}

interface GuestSession {
  id: string;
  userId: string | null;
  tokenHash: Buffer;
  displayName: string;
  socketId: string | null;
  previousSocketId: string | null;
  roomId: string | null;
  gameRoomId: string | null;
  expiresAt: number | null;
  expiryTimer: NodeJS.Timeout | null;
}

const GUEST_RECONNECT_GRACE_MS = 15_000;

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Namespace;

  private readonly logger = new Logger(GameGateway.name);
  private rooms = new Map<string, GameInstance>();
  private clientRoom = new Map<string, string>(); // socketId -> roomId
  private clientGameRoom = new Map<string, string>(); // socketId -> gameRoomId
  private clientChatRoom = new Map<string, string>(); // socketId -> chat roomId
  private matchmakingQueue: Socket[] = [];
  private guestSessions = new Map<string, GuestSession>();
  private socketGuestSession = new Map<string, string>();

  // Custom Rooms
  private customRooms = new Map<string, CustomRoom>();

  constructor(
    private readonly gameService: GameService,
    private readonly chatService: ChatService,
    private readonly aiAgentService: AiAgentService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log('GameGateway initialized');
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    let authenticatedUserId: string | null = null;
    if (typeof token === 'string' && token.length > 0) {
      try {
        const payload = this.jwtService.verify<{ sub: string }>(token);
        if (typeof payload.sub === 'string') {
          authenticatedUserId = payload.sub;
          client.data.userId = payload.sub;

          const user = await this.prisma.user
            .findUnique({
              where: { id: payload.sub },
              select: { username: true },
            })
            .catch(() => null);

          if (user) {
            client.data.username = user.username;
          }

          // DBのオンラインステータスを更新し、全体に通知
          await this.prisma.user
            .update({
              where: { id: payload.sub },
              data: { isOnline: true },
            })
            .catch(() => {});
          this.server.emit('user_status_changed', {
            userId: payload.sub,
            isOnline: true,
          });
        }
      } catch {
        this.logger.warn(`無効なWebSocketトークン: ${client.id}`);
      }
    }

    const isGuestGameSession = client.handshake.auth?.guestGameSession === true;
    if (isGuestGameSession) {
      const { session, reconnectToken, resumed } =
        this.connectGuestSession(client, authenticatedUserId);
      setTimeout(() => {
        if (!client.connected) return;
        client.emit('session:ready', {
          guestSessionId: session.id,
          reconnectToken,
          displayName: session.displayName,
          resumed,
          reconnectGraceMs: GUEST_RECONNECT_GRACE_MS,
        });
        if (resumed) this.emitRestoredGuestState(client, session);
      }, 0);
    }
    this.logger.log(`接続: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`切断: ${client.id}`);
    this.clientChatRoom.delete(client.id);

    const userId = client.data.userId;
    if (userId) {
      // DBのオンラインステータスをオフラインに更新し、全体に通知
      await this.prisma.user
        .update({
          where: { id: userId },
          data: { isOnline: false, lastSeenAt: new Date() },
        })
        .catch(() => {});
      this.server.emit('user_status_changed', { userId, isOnline: false });
    }

    // マッチメイキングキューから除外
    this.matchmakingQueue = this.matchmakingQueue.filter(
      (s) => s.id !== client.id,
    );

    const guestSessionId = this.socketGuestSession.get(client.id);
    const guestSession = guestSessionId
      ? this.guestSessions.get(guestSessionId)
      : undefined;
    const roomId = this.clientRoom.get(client.id) ?? null;
    const gameRoomId = this.clientGameRoom.get(client.id) ?? null;
    if (
      guestSession &&
      guestSession.socketId === client.id &&
      this.canRestoreGuest(client.id, roomId, gameRoomId)
    ) {
      this.reserveGuestReconnect(
        guestSession,
        client,
        roomId,
        gameRoomId,
      );
      return;
    }

    this.finalizeDisconnectedSocket(client, roomId, gameRoomId);
    if (guestSession && guestSession.socketId === client.id) {
      this.deleteGuestSession(guestSession.id);
    }
  }

  private hashGuestToken(token: string): Buffer {
    return createHash('sha256').update(token).digest();
  }

  private guestTokenMatches(session: GuestSession, token: unknown): boolean {
    if (typeof token !== 'string' || token.length < 32 || token.length > 256)
      return false;
    const candidate = this.hashGuestToken(token);
    return (
      candidate.length === session.tokenHash.length &&
      timingSafeEqual(candidate, session.tokenHash)
    );
  }

  private createGuestSession(
    client: Socket,
    userId: string | null,
  ): {
    session: GuestSession;
    reconnectToken: string;
  } {
    const id = `guest:${randomUUID()}`;
    const reconnectToken = randomBytes(32).toString('base64url');
    const displayName =
      (client.data.username as string | undefined) ??
      (userId
        ? `PLAYER-${id.slice(-8).toUpperCase()}`
        : `GUEST-${id.slice(-8).toUpperCase()}`);
    const session: GuestSession = {
      id,
      userId,
      tokenHash: this.hashGuestToken(reconnectToken),
      displayName,
      socketId: client.id,
      previousSocketId: null,
      roomId: null,
      gameRoomId: null,
      expiresAt: null,
      expiryTimer: null,
    };
    this.guestSessions.set(id, session);
    this.socketGuestSession.set(client.id, id);
    client.data.guestSessionId = id;
    client.data.username = displayName;
    return { session, reconnectToken };
  }

  private connectGuestSession(
    client: Socket,
    userId: string | null,
  ): {
    session: GuestSession;
    reconnectToken: string;
    resumed: boolean;
  } {
    const requestedId = client.handshake.auth?.guestSessionId;
    const requestedToken = client.handshake.auth?.reconnectToken;
    const existing =
      typeof requestedId === 'string'
        ? this.guestSessions.get(requestedId)
        : undefined;
    const canClaim =
      !!existing &&
      existing.userId === userId &&
      existing.socketId === null &&
      existing.expiresAt !== null &&
      existing.expiresAt > Date.now() &&
      this.guestTokenMatches(existing, requestedToken);

    if (!existing || !canClaim) {
      const created = this.createGuestSession(client, userId);
      return { ...created, resumed: false };
    }

    if (existing.expiryTimer) clearTimeout(existing.expiryTimer);
    existing.expiryTimer = null;
    existing.expiresAt = null;
    existing.socketId = client.id;
    this.socketGuestSession.set(client.id, existing.id);
    client.data.guestSessionId = existing.id;
    if (userId && typeof client.data.username === 'string') {
      existing.displayName = client.data.username;
    }
    client.data.username = existing.displayName;

    const reconnectToken = randomBytes(32).toString('base64url');
    existing.tokenHash = this.hashGuestToken(reconnectToken);
    const resumed = this.restoreGuestSocket(existing, client);
    return { session: existing, reconnectToken, resumed };
  }

  private canRestoreGuest(
    socketId: string,
    roomId: string | null,
    gameRoomId: string | null,
  ): boolean {
    if (roomId && this.customRooms.has(roomId)) return true;
    const instance = this.rooms.get(gameRoomId ?? roomId ?? '');
    // VS AI still uses browser-owned state for the human side, so it cannot
    // yet restore a complete authoritative snapshot safely.
    if (instance?.isAiMatch) return false;
    const player = instance?.getPlayers().get(socketId);
    return !!player && !player.isGameOver;
  }

  private reserveGuestReconnect(
    session: GuestSession,
    client: Socket,
    roomId: string | null,
    gameRoomId: string | null,
  ): void {
    session.socketId = null;
    session.previousSocketId = client.id;
    session.roomId = roomId;
    session.gameRoomId = gameRoomId;
    session.expiresAt = Date.now() + GUEST_RECONNECT_GRACE_MS;
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    session.expiryTimer = setTimeout(() => {
      const current = this.guestSessions.get(session.id);
      if (!current || current.socketId !== null) return;
      this.finalizeDisconnectedSocket(client, roomId, gameRoomId);
      this.deleteGuestSession(session.id);
    }, GUEST_RECONNECT_GRACE_MS);

    const targetRoomId = gameRoomId ?? roomId;
    if (targetRoomId) {
      this.server.to(targetRoomId).emit('player:disconnected', {
        playerId: client.id,
        reconnectGraceMs: GUEST_RECONNECT_GRACE_MS,
      });
    }
  }

  private restoreGuestSocket(session: GuestSession, client: Socket): boolean {
    const oldSocketId = session.previousSocketId;
    if (!oldSocketId) return false;

    const roomId = session.roomId;
    const gameRoomId = session.gameRoomId;
    let restored = false;

    if (roomId && (this.customRooms.has(roomId) || this.rooms.has(roomId))) {
      this.clientRoom.delete(oldSocketId);
      this.clientRoom.set(client.id, roomId);
      client.join(roomId);
      restored = true;
    }
    if (gameRoomId && this.rooms.has(gameRoomId)) {
      this.clientGameRoom.delete(oldSocketId);
      this.clientGameRoom.set(client.id, gameRoomId);
      client.join(gameRoomId);
      restored = true;
    }

    const instance = this.rooms.get(gameRoomId ?? roomId ?? '');
    if (instance?.rebindSocket(oldSocketId, client.id)) restored = true;

    const customRoom = roomId ? this.customRooms.get(roomId) : undefined;
    if (customRoom) {
      const player = customRoom.players.find(
        (candidate) => candidate.socket.id === oldSocketId,
      );
      if (player) player.socket = client;
      if (customRoom.ownerSocketId === oldSocketId)
        customRoom.ownerSocketId = client.id;
      if (customRoom.tournament)
        this.replaceTournamentSocketId(
          customRoom.tournament,
          oldSocketId,
          client.id,
        );
      const players = customRoom.players.map((roomPlayer) => ({
        socketId: roomPlayer.socket.id,
        userId: roomPlayer.userId,
        username: roomPlayer.username,
        wins: roomPlayer.wins,
      }));
      customRoom.players.forEach((roomPlayer) => {
        if (roomPlayer.socket.connected) {
          roomPlayer.socket.emit('custom_room_players_updated', { players });
          if (customRoom.tournament) {
            roomPlayer.socket.emit('tournament_state', {
              tournament: customRoom.tournament,
            });
          }
        }
      });
    }

    this.socketGuestSession.delete(oldSocketId);
    session.previousSocketId = null;
    session.roomId = roomId;
    session.gameRoomId = gameRoomId;

    if (restored) {
      const targetRoomId = gameRoomId ?? roomId;
      if (targetRoomId) {
        this.server.to(targetRoomId).emit('player:reconnected', {
          oldPlayerId: oldSocketId,
          newPlayerId: client.id,
          displayName: session.displayName,
        });
      }
    }
    return restored;
  }

  private replaceTournamentSocketId(
    tournament: Tournament,
    oldSocketId: string,
    newSocketId: string,
  ): void {
    if (tournament.playerNames[oldSocketId]) {
      tournament.playerNames[newSocketId] =
        tournament.playerNames[oldSocketId];
      delete tournament.playerNames[oldSocketId];
    }
    tournament.matches.forEach((match) => {
      match.playerIds = match.playerIds.map((id) =>
        id === oldSocketId ? newSocketId : id,
      );
      if (match.winnerId === oldSocketId) match.winnerId = newSocketId;
    });
  }

  private emitRestoredGuestState(client: Socket, session: GuestSession): void {
    const roomId = session.roomId;
    const gameRoomId = session.gameRoomId;
    const customRoom = roomId ? this.customRooms.get(roomId) : undefined;
    if (customRoom) this.emitCustomRoomState(customRoom, client);

    const instance = this.rooms.get(gameRoomId ?? roomId ?? '');
    if (!instance) return;
    const players = [...instance.getPlayers().keys()];
    const displayNames = this.getDisplayNames(players, customRoom);
    if (instance.getPlayers().has(client.id)) {
      client.emit(ServerEvent.MATCH_FOUND, {
        roomId: instance.roomId,
        seed: instance.gameSeed,
        players,
        displayNames,
        reconnected: true,
        started: instance.isStarted,
        vsAi: instance.isAiMatch,
      });
    } else {
      client.emit('spectating', {
        roomId: instance.roomId,
        players,
        displayNames,
        isStarted: instance.isStarted,
      });
    }
    instance.broadcastSnapshot();
  }

  private getDisplayNames(
    playerIds: string[],
    customRoom?: CustomRoom,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    playerIds.forEach((socketId, index) => {
      const customPlayer = customRoom?.players.find(
        (player) => player.socket.id === socketId,
      );
      const socket = this.server.sockets.get(socketId);
      result[socketId] =
        customPlayer?.username ??
        (socket?.data?.username as string | undefined) ??
        `Player ${index + 1}`;
    });
    return result;
  }

  private emitCustomRoomState(room: CustomRoom, client: Socket): void {
    client.emit('custom_room_state', {
      inRoom: true,
      roomId: room.roomId,
      name: room.name,
      isOwner: room.ownerSocketId === client.id,
      players: room.players.map((player) => ({
        socketId: player.socket.id,
        userId: player.userId,
        username: player.username,
        wins: player.wins,
      })),
      isPlaying: room.isPlaying,
      tournament: room.tournament,
    });
  }

  private deleteGuestSession(sessionId: string): void {
    const session = this.guestSessions.get(sessionId);
    if (!session) return;
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    if (session.socketId) this.socketGuestSession.delete(session.socketId);
    if (session.previousSocketId)
      this.socketGuestSession.delete(session.previousSocketId);
    this.guestSessions.delete(sessionId);
  }

  private isSocketConnectedOrRecovering(socketId: string): boolean {
    const socket = this.server.sockets.get(socketId);
    if (socket?.connected) return true;
    const sessionId = this.socketGuestSession.get(socketId);
    const session = sessionId ? this.guestSessions.get(sessionId) : undefined;
    return (
      !!session &&
      session.socketId === null &&
      session.previousSocketId === socketId &&
      (session.expiresAt ?? 0) > Date.now()
    );
  }

  private finalizeDisconnectedSocket(
    client: Socket,
    roomId: string | null,
    gameRoomId: string | null,
  ): void {

    // ゲーム中だった場合
    if (gameRoomId) {
      const room = this.rooms.get(gameRoomId);
      if (room) {
        room.removeSpectator(client.id);
        room.handleGameOver(client.id);
      }
    } else if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        if (room.isAiMatch) {
          room.handleClientGameOver(client.id);
        } else {
          room.handleGameOver(client.id);
        }
      }
    }

    if (roomId) {
      const activeRoom = this.customRooms.get(roomId);
      if (activeRoom) {
        if (!activeRoom.isTournamentActive) {
          activeRoom.players = activeRoom.players.filter(
            (p) => p.socket.id !== client.id,
          );
        }
        // Check if any other player is still connected and in the room
        const hasActivePlayers = activeRoom.players.some(
          (p) =>
            p.socket.id !== client.id &&
            this.isSocketConnectedOrRecovering(p.socket.id) &&
            this.clientRoom.get(p.socket.id) === roomId,
        );

        if (!hasActivePlayers) {
          this.customRooms.delete(roomId);
        } else {
          if (activeRoom.ownerSocketId === client.id) {
            const nextOwner = activeRoom.players.find(
              (p) =>
                p.socket.id !== client.id &&
                this.isSocketConnectedOrRecovering(p.socket.id) &&
                this.clientRoom.get(p.socket.id) === roomId,
            );
            if (nextOwner) {
              activeRoom.ownerSocketId = nextOwner.socket.id;
            }
          }
          activeRoom.players.forEach((p) => {
            if (this.clientRoom.get(p.socket.id) === roomId && p.socket.id !== client.id) {
              p.socket.emit('custom_room_state', {
                inRoom: true,
                roomId: activeRoom.roomId,
                name: activeRoom.name,
                isOwner: activeRoom.ownerSocketId === p.socket.id,
                players: activeRoom.players.map((pl) => ({
                  socketId: pl.socket.id,
                  userId: pl.userId,
                  username: pl.username,
                  wins: pl.wins,
                })),
                isPlaying: activeRoom.isPlaying,
                tournament: activeRoom.tournament,
              });
            }
          });
        }
        this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
      }
      this.clientRoom.delete(client.id);
    }
    if (gameRoomId) this.clientGameRoom.delete(client.id);
    this.socketGuestSession.delete(client.id);
  }

  private getCustomRoomsList() {
    return Array.from(this.customRooms.values()).map((r) => ({
      roomId: r.roomId,
      name: r.name,
      ownerId: r.ownerSocketId,
    }));
  }

  // ── ゲーム履歴保存 ─────────────────────────────────────────
  private async saveGameStats(
    roomId: string,
    winnerSocketId: string | null,
    stats: Record<string, any>,
    gameMode: 'VERSUS' | 'AI' | 'TOURNAMENT',
    isAiGame: boolean,
    aiDifficulty?: AiDifficulty,
  ) {
    const socketIds = Object.keys(stats);
    if (socketIds.length < 2) return;

    const p1SocketId = socketIds[0];
    const p2SocketId = socketIds[1];
    const p1Stats = stats[p1SocketId];
    const p2Stats = stats[p2SocketId];
    const winnerUserId = winnerSocketId ? stats[winnerSocketId]?.userId : null;

    try {
      await this.gameService.saveResult({
        roomId,
        player1Id: p1Stats.userId,
        player2Id: p2Stats.userId,
        winnerId: winnerUserId,
        winnerPlayer: winnerSocketId === p1SocketId ? 1 : winnerSocketId === p2SocketId ? 2 : null,
        isAiGame,
        aiDifficulty,
        player1Apm: p1Stats.apm,
        player2Apm: p2Stats.apm,
        player1Pps: p1Stats.pps,
        player2Pps: p2Stats.pps,
        player1LinesCleared: p1Stats.linesCleared,
        player2LinesCleared: p2Stats.linesCleared,
        player1TSpins: p1Stats.tSpins,
        player2TSpins: p2Stats.tSpins,
        player1Tetrises: p1Stats.tetrises,
        player2Tetrises: p2Stats.tetrises,
        garbageSent1to2: p1Stats.attacksSent,
        garbageSent2to1: p2Stats.attacksSent,
        durationSeconds: Math.max(
          p1Stats.durationSeconds,
          p2Stats.durationSeconds,
        ),
        gameMode: gameMode,
      });
    } catch (e) {
      this.logger.error('Failed to save game result', e);
    }
  }

  // ── マッチメイキング ──────────────────────────────────────
  @SubscribeMessage(ClientEvent.JOIN_QUEUE)
  handleJoinQueue(@ConnectedSocket() client: Socket) {
    const already = this.matchmakingQueue.find((s) => s.id === client.id);
    if (already) return;

    if (this.matchmakingQueue.length > 0) {
      const opponent = this.matchmakingQueue.shift()!;
      const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const seed = Math.floor(Math.random() * 2147483647);

      const onGameOver = (rId: string, winnerId: string | null, stats: any) => {
        this.saveGameStats(rId, winnerId, stats, 'VERSUS', false);
        this.rooms.delete(rId);
      };

      const instance = new GameInstance(
        roomId,
        this.server,
        seed,
        onGameOver,
        this.aiAgentService,
      );

      // ユーザーIDはJWTから取得（実装簡略化のため socket.data を利用）
      const userId1 = (client.data?.userId as string) ?? null;
      const userId2 = (opponent.data?.userId as string) ?? null;

      instance.addPlayer(client.id, userId1);
      instance.addPlayer(opponent.id, userId2);

      client.join(roomId);
      opponent.join(roomId);
      this.clientRoom.set(client.id, roomId);
      this.clientRoom.set(opponent.id, roomId);
      this.rooms.set(roomId, instance);

      const p1Username = (opponent.data?.username as string) ?? null;
      const p2Username = (client.data?.username as string) ?? null;

      this.server.to(roomId).emit(ServerEvent.MATCH_FOUND, {
        roomId,
        seed,
        player1: opponent.id,
        player2: client.id,
        players: [opponent.id, client.id],
        displayNames: {
          [opponent.id]: p1Username || (opponent.data?.userId as string) || 'Player 1',
          [client.id]: p2Username || (client.data?.userId as string) || 'Player 2',
        },
        users: {
          [opponent.id]: { username: p1Username },
          [client.id]: { username: p2Username },
        }
      });

      // ゲームスタート
      instance.prepareHumanMatch();
    } else {
      this.matchmakingQueue.push(client);
      client.emit('waiting_for_match');
    }
  }

  @SubscribeMessage(ClientEvent.LEAVE_QUEUE)
  handleLeaveQueue(@ConnectedSocket() client: Socket) {
    this.matchmakingQueue = this.matchmakingQueue.filter(
      (s) => s.id !== client.id,
    );
    client.emit('queue_left');
  }

  // ── カスタムルーム (マルチプレイ) ──────────────────────────
  @SubscribeMessage('game:create_custom_room')
  handleCreateCustomRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name?: string },
  ) {
    // 既存の自分のルームがあれば削除（1人1ルーム）
    for (const [rId, room] of this.customRooms.entries()) {
      if (room.ownerSocketId === client.id) {
        this.customRooms.delete(rId);
      }
    }

    const roomId = Math.random().toString(36).slice(2, 6).toUpperCase();

    if (this.customRooms.has(roomId)) {
      client.emit('error', {
        message: 'Failed to generate unique Room ID. Please try again.',
      });
      return;
    }

    const roomName = data?.name?.trim() || `Room ${roomId}`;

    this.customRooms.set(roomId, {
      roomId,
      name: roomName,
      ownerSocketId: client.id,
      players: [
        {
          socket: client,
          userId: (client.data?.userId as string) || null,
          guestSessionId:
            (client.data?.guestSessionId as string | undefined) ?? null,
          username: (client.data?.username as string) || 'Player 1',
          wins: 0,
        },
      ],
      isPlaying: false,
    });

    client.join(roomId);
    this.clientRoom.set(client.id, roomId);
    client.emit('custom_room_created', {
      roomId,
      name: roomName,
      players: [
        {
          socketId: client.id,
          userId: (client.data?.userId as string) || null,
          username: (client.data?.username as string) || 'Player 1',
          wins: 0,
        },
      ],
    });
    this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
  }

  @SubscribeMessage('game:update_custom_room_id')
  handleUpdateCustomRoomId(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { newRoomId: string },
  ) {
    const newId = data.newRoomId.trim().toUpperCase();
    if (!newId || newId.length === 0) {
      client.emit('error', { message: 'Invalid Room ID' });
      return;
    }

    if (this.customRooms.has(newId)) {
      client.emit('error', { message: 'Room ID already exists' });
      return;
    }

    let oldRoomId: string | null = null;
    let targetRoom: any = null;

    for (const [rId, room] of this.customRooms.entries()) {
      if (room.ownerSocketId === client.id) {
        oldRoomId = rId;
        targetRoom = room;
        break;
      }
    }

    if (!oldRoomId || !targetRoom) {
      client.emit('error', { message: 'You do not own a room' });
      return;
    }

    this.customRooms.delete(oldRoomId);
    targetRoom.roomId = newId;
    // update room name if it was the default
    if (targetRoom.name === `Room ${oldRoomId}`) {
      targetRoom.name = `Room ${newId}`;
    }
    this.customRooms.set(newId, targetRoom);

    // Swap socket rooms
    client.leave(oldRoomId);
    client.join(newId);

    client.emit('custom_room_id_updated', { oldId: oldRoomId, newId });
    this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
  }

  @SubscribeMessage('game:get_custom_rooms')
  handleGetCustomRooms(@ConnectedSocket() client: Socket) {
    client.emit('custom_rooms_updated', this.getCustomRoomsList());
  }

  @SubscribeMessage('game:request_custom_room_state')
  handleRequestCustomRoomState(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (room) {
      client.emit('custom_room_state', {
        inRoom: true,
        roomId: room.roomId,
        name: room.name,
        isOwner: room.ownerSocketId === client.id,
        players: room.players.map((pl) => ({
          socketId: pl.socket.id,
          userId: pl.userId,
          username: pl.username,
          wins: pl.wins,
        })),
        isPlaying: room.isPlaying,
        tournament: room.tournament,
      });
    }
  }

  @SubscribeMessage('game:leave_custom_room')
  handleLeaveCustomRoom(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;

    const gameRoomId = this.clientGameRoom.get(client.id);
    const targetRoomId = gameRoomId ?? roomId;

    if (targetRoomId) {
      const gRoom = this.rooms.get(targetRoomId);
      if (gRoom) {
        gRoom.removeSpectator(client.id);
        gRoom.handleGameOver(client.id);
      }
    }

    const room = this.customRooms.get(roomId);
    if (room) {
      if (!room.isTournamentActive) {
        room.players = room.players.filter((p) => p.socket.id !== client.id);
      }
      
      const hasActivePlayers = room.players.some(
        (p) =>
          p.socket.id !== client.id &&
          this.isSocketConnectedOrRecovering(p.socket.id) &&
          this.clientRoom.get(p.socket.id) === roomId,
      );

      if (!hasActivePlayers) {
        this.customRooms.delete(roomId);
      } else {
        if (room.ownerSocketId === client.id) {
          const nextOwner = room.players.find(
            (p) =>
              p.socket.id !== client.id &&
              this.isSocketConnectedOrRecovering(p.socket.id) &&
              this.clientRoom.get(p.socket.id) === roomId,
          );
          if (nextOwner) {
            room.ownerSocketId = nextOwner.socket.id;
          }
        }
        room.players.forEach((p) => {
          if (this.clientRoom.get(p.socket.id) === roomId && p.socket.id !== client.id) {
            p.socket.emit('custom_room_state', {
              inRoom: true,
              roomId: room.roomId,
              name: room.name,
              isOwner: room.ownerSocketId === p.socket.id,
              players: room.players.map((pl) => ({
                socketId: pl.socket.id,
                userId: pl.userId,
                username: pl.username,
                wins: pl.wins,
              })),
              isPlaying: room.isPlaying,
              tournament: room.tournament,
            });
          }
        });
      }
      this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
    }
    this.clientRoom.delete(client.id);
    client.leave(roomId);
    client.emit('custom_room_state', { inRoom: false });
  }

  @SubscribeMessage('game:join_custom_room')
  handleJoinCustomRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = this.customRooms.get(data.roomId);
    if (!room) {
      client.emit('error', { message: 'ルームが見つかりません' });
      return;
    }
    const existingSameSocketIndex = room.players.findIndex((p) => p.socket.id === client.id);
    if (existingSameSocketIndex !== -1) {
      // Already in room.players (e.g., they clicked leave but were kept because tournament was active).
      // Seamlessly rejoin them to the socket.io room and update state.
      this.clientRoom.set(client.id, room.roomId);
      client.join(room.roomId);
      
      const payload = {
        inRoom: true,
        roomId: room.roomId,
        name: room.name,
        isOwner: room.ownerSocketId === client.id,
        players: room.players.map((pl) => ({
          socketId: pl.socket.id,
          userId: pl.userId,
          username: pl.username,
          wins: pl.wins,
        })),
        isPlaying: room.isPlaying,
        tournament: room.tournament,
      };
      client.emit('custom_room_state', payload);
      
      // Update others
      room.players.forEach(p => {
        if (p.socket.id !== client.id) p.socket.emit('custom_room_players_updated', { players: payload.players });
      });
      return;
    }

    let isReconnecting = false;
    console.log(`[handleJoinCustomRoom] Client ${client.id} joining ${data.roomId}. isTournamentActive: ${room.isTournamentActive}`);
    if (room.isTournamentActive) {
      const userId = (client.data?.userId as string) ?? null;
      const guestSessionId =
        (client.data?.guestSessionId as string | undefined) ?? null;
      
      // Find a player with the same userId.
      // If anonymous (null), require them to be disconnected to prevent hijacking other anonymous players.
      // If authenticated, allow hijacking their own slot to avoid race conditions on page reload.
      const existingPlayerIndex = room.players.findIndex(p => {
        if (userId === null)
          return (
            guestSessionId !== null &&
            p.guestSessionId === guestSessionId &&
            p.socket.disconnected
          );
        return p.userId === userId;
      });
      
      if (existingPlayerIndex === -1) {
        client.emit('error', { message: 'トーナメント進行中は新規参加できません' });
        return;
      }
      
      isReconnecting = true;
      const oldSocketId = room.players[existingPlayerIndex].socket.id;
      room.players[existingPlayerIndex].socket = client;
      
      if (room.tournament) {
        if (room.tournament.playerNames[oldSocketId]) {
          room.tournament.playerNames[client.id] = room.tournament.playerNames[oldSocketId];
          delete room.tournament.playerNames[oldSocketId];
        }
        const updateSocketId = (matches: any[]) => {
          matches.forEach(m => {
            m.playerIds = m.playerIds.map((id: string) => id === oldSocketId ? client.id : id);
            if (m.winnerId === oldSocketId) m.winnerId = client.id;
            if (m.children) updateSocketId(m.children);
          });
        };
        updateSocketId(room.tournament.matches);
      }
      
      if (room.ownerSocketId === oldSocketId) {
        room.ownerSocketId = client.id;
      } else if (
        !room.players.find(
          (p) =>
            p.socket.id === room.ownerSocketId &&
            this.isSocketConnectedOrRecovering(p.socket.id),
        )
      ) {
        room.ownerSocketId = client.id;
      }
    } else {
      let lowest = 1;
      while (room.players.some(p => p.username === `Player ${lowest}`)) {
        lowest++;
      }
      room.players.push({
        socket: client,
        userId: (client.data?.userId as string) ?? null,
        guestSessionId:
          (client.data?.guestSessionId as string | undefined) ?? null,
        username: (client.data?.username as string) ?? `Player ${lowest}`,
        wins: 0,
      });
    }

    client.join(room.roomId);
    this.clientRoom.set(client.id, room.roomId);
    this.server.emit('custom_rooms_updated', this.getCustomRoomsList());

    client.emit('custom_room_state', {
      inRoom: true,
      roomId: room.roomId,
      name: room.name,
      isOwner: room.ownerSocketId === client.id,
      players: room.players.map((pl) => ({
        socketId: pl.socket.id,
        userId: pl.userId,
        username: pl.username,
        wins: pl.wins,
      })),
      isPlaying: room.isPlaying,
      tournament: room.tournament,
    });

    room.players.forEach((p) => {
      if (p.socket.id !== client.id && this.clientRoom.get(p.socket.id) === room.roomId) {
        p.socket.emit('custom_room_players_updated', {
          players: room.players.map((pl) => ({
            socketId: pl.socket.id,
            userId: pl.userId,
            username: pl.username,
            wins: pl.wins,
          })),
        });
      }
    });

    if (room.isPlaying && room.tournament) {
      const activeMatch = room.tournament.matches.find((m) => m.isPlaying);
      if (activeMatch) {
        const gameRoomId = `${room.roomId}_${activeMatch.id}`;
        const instance = this.rooms.get(gameRoomId);
        if (instance) {
          instance.addSpectator(client.id);
          this.clientGameRoom.set(client.id, gameRoomId);
          client.join(gameRoomId);
          const displayNames: Record<string, string> = {};
          room.players.forEach((p, idx) => {
            displayNames[p.socket.id] = p.username ? p.username : (p.userId ? p.userId : `Player ${idx + 1}`);
          });
          client.emit('spectating', {
            roomId: gameRoomId,
            displayNames,
            players: activeMatch.playerIds,
            isStarted: instance.isStarted
          });
          instance.broadcastSnapshot();
        }
      }
      client.emit('tournament_state', { tournament: room.tournament });
    }
  }

  @SubscribeMessage('game:create_tournament')
  handleCreateTournament(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (!room || room.ownerSocketId !== client.id || room.players.length < 4)
      return;

    room.isTournamentActive = true;
    const playerIds = room.players.map((p) => p.socket.id);

    // socketId → 表示名 のマップを開始時点で記録（退出後も名前を参照できるように）
    const playerNames: Record<string, string> = {};
    room.players.forEach((p) => {
      playerNames[p.socket.id] = p.username!;
    });

    room.tournament = generateTournamentBracket(playerIds, playerNames);

    // Broadcast tournament state
    room.players.forEach((p) => {
      p.socket.emit('tournament_state', { tournament: room.tournament });
    });

  }

  @SubscribeMessage('game:start_tournament_match')
  handleStartTournamentMatch(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (!room || room.ownerSocketId !== client.id || !room.tournament) return;
    
    // Only start if not already playing and not finished
    if (!room.isPlaying && !room.tournament.root.winnerId) {
      this.startNextTournamentRound(roomId);
    }
  }

  @SubscribeMessage('game:clear_tournament')
  handleClearTournament(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (room && room.ownerSocketId === client.id) {
      room.tournament = undefined;
      // トーナメント終了時に全プレイヤーの clientGameRoom マッピングをクリアする。
      // これにより次回のトーナメント開始時に古いゲームルームへの参照が残らなくなる。
      room.players.forEach((p) => {
        this.clientGameRoom.delete(p.socket.id);
      });
      room.players.forEach((p) => {
        p.socket.emit('tournament_state', { tournament: undefined });
        p.socket.emit('custom_room_state', {
          inRoom: true,
          roomId: room.roomId,
          name: room.name,
          isOwner: room.ownerSocketId === p.socket.id,
          players: room.players.map((pl) => ({
            socketId: pl.socket.id,
            userId: pl.userId,
            username: pl.username,
            wins: pl.wins,
          })),
          isPlaying: room.isPlaying,
          tournament: undefined,
        });
      });
      this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
    }
  }

  private startNextTournamentRound(roomId: string) {
    const room = this.customRooms.get(roomId);
    if (!room || !room.tournament) return;

    const tournament = room.tournament;

    const matchesToStart = tournament.matches.filter(
      (m) =>
        !m.winnerId &&
        !m.isPlaying &&
        ((m.children.length > 0 && m.playerIds.length >= m.children.length) ||
          (m.children.length === 0 && m.playerIds.length >= 2)),
    );

    let startedCount = 0;

    matchesToStart.forEach((currentMatch) => {
      const activePlayerSockets = currentMatch.playerIds
        .map((id) => room.players.find((p) => p.socket.id === id))
        .filter(
          (
            p,
          ): p is {
            socket: Socket;
            userId: string | null;
            username: string | null;
            wins: number;
          } => !!p,
        );

      if (activePlayerSockets.length < 2) {
        const survivor =
          activePlayerSockets.length === 1
            ? activePlayerSockets[0]?.socket.id
            : currentMatch.playerIds[0] || '';
        currentMatch.winnerId = survivor || '';

        const parentMatch = tournament.matches.find((m) =>
          m.children.some((c) => c.id === currentMatch.id),
        );
        if (parentMatch && survivor) {
          parentMatch.playerIds.push(survivor);
        }
        return;
      }

      startedCount++;
      currentMatch.isPlaying = true;

      const gameRoomId = `${roomId}_${currentMatch.id}`;
      const seed = Math.floor(Math.random() * 2147483647);

      const instance = new GameInstance(
        gameRoomId,
        this.server,
        seed,
        (rId, winnerSocketId, stats) => {
          currentMatch.winnerId =
            winnerSocketId || activePlayerSockets[0]?.socket.id || '';
          currentMatch.isPlaying = false;

          const parentMatch = tournament.matches.find((m) =>
            m.children.some((c) => c.id === currentMatch.id),
          );
          if (parentMatch) {
            parentMatch.playerIds.push(currentMatch.winnerId);
          } else if (currentMatch.id === tournament.root.id) {
            room.isTournamentActive = false;
            console.log(`[Tournament End] Tournament finished for room ${roomId}. isTournamentActive set to false.`);
            this.server.to(gameRoomId).emit('tournament_win', { winnerId: currentMatch.winnerId });
          }

          for (const [sid, rId] of this.clientGameRoom.entries()) {
            if (rId === gameRoomId) {
              this.clientGameRoom.delete(sid);
            }
          }
          this.server.in(gameRoomId).socketsLeave(gameRoomId);

          this.rooms.delete(rId);

          const anyPlaying = tournament.matches.some((m) => m.isPlaying);
          room.isPlaying = anyPlaying;

          if (!anyPlaying) {
            this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
          }

          room.players.forEach((p) => {
            p.socket.emit('tournament_state', { tournament: room.tournament });
            p.socket.emit('custom_room_state', {
              inRoom: true,
              roomId: room.roomId,
              name: room.name,
              isOwner: room.ownerSocketId === p.socket.id,
              players: room.players.map((pl) => ({
                socketId: pl.socket.id,
                userId: pl.userId,
                username: pl.username,
                wins: pl.wins,
              })),
              isPlaying: room.isPlaying,
              tournament: room.tournament,
            });
          });
        },
        this.aiAgentService,
      );

      this.rooms.set(gameRoomId, instance);

      const users: Record<string, { username: string | null }> = {};
      const displayNames: Record<string, string> = {};
      
      const customRoom = this.customRooms.get(roomId);
      if (customRoom) {
        customRoom.players.forEach((p, idx) => {
          displayNames[p.socket.id] = p.username ? p.username : (p.userId ? p.userId : `Player ${idx + 1}`);
        });
      }

      activePlayerSockets.forEach((p) => {
        if (p?.socket) {
          users[p.socket.id] = { username: p.username };
        }
      });

      activePlayerSockets.forEach((p) => {
        if (!p || !p.socket) return;
        instance.addPlayer(p.socket.id, p.userId);
        this.clientGameRoom.set(p.socket.id, gameRoomId);
        p.socket.join(gameRoomId);
        p.socket.emit('match:found', {
          roomId: gameRoomId,
          seed,
          players: activePlayerSockets
            .map((pl) => pl?.socket?.id)
            .filter((id) => !!id),
          displayNames,
          users,
          isSpectator: false,
        });
      });

      instance.prepareHumanMatch();
    });

    if (startedCount > 0) {
      room.isPlaying = true;
      this.server.emit('custom_rooms_updated', this.getCustomRoomsList());

      const firstStartedMatch = matchesToStart.find((m) => m.isPlaying);
      if (firstStartedMatch) {
        const gameRoomId = `${roomId}_${firstStartedMatch.id}`;
        const instance = this.rooms.get(gameRoomId);
        if (instance) {
          room.players.forEach((p) => {
            if (!p || !p.socket) return;
            const isPlayingInAny = matchesToStart.some(
              (m) => m.isPlaying && m.playerIds.includes(p.socket.id),
            );
            if (!isPlayingInAny) {
              // 以前のゲームルームがあれば、そこから離脱してからスペクテーターとして登録する
              const prevGameRoomId = this.clientGameRoom.get(p.socket.id);
              if (prevGameRoomId && prevGameRoomId !== gameRoomId) {
                const prevInstance = this.rooms.get(prevGameRoomId);
                if (prevInstance) prevInstance.removeSpectator(p.socket.id);
                p.socket.leave(prevGameRoomId);
              }
              instance.addSpectator(p.socket.id);
              this.clientGameRoom.set(p.socket.id, gameRoomId);
              p.socket.join(gameRoomId);
              const displayNames: Record<string, string> = {};
              room.players.forEach((rp, idx) => {
                displayNames[rp.socket.id] = rp.username ? rp.username : (rp.userId ? rp.userId : `Player ${idx + 1}`);
              });

              p.socket.emit('spectating', {
                roomId: gameRoomId,
                displayNames,
                players: firstStartedMatch.playerIds,
                isStarted: instance.isStarted
              });
              instance.broadcastSnapshot();
            }
          });
        }
      }
    } else {
      const anyPlaying = tournament.matches.some((m) => m.isPlaying);
      if (
        !anyPlaying &&
        !tournament.root.winnerId &&
        matchesToStart.length > 0
      ) {
        this.startNextTournamentRound(roomId);
      }
      room.players.forEach((p) => {
        p.socket.emit('tournament_state', { tournament: room.tournament });
      });
    }
  }

  @SubscribeMessage('game:start_custom_room')
  handleStartCustomRoom(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (
      !room ||
      room.ownerSocketId !== client.id ||
      room.players.length < 2 ||
      room.players.length > 3
    )
      return;

    if (this.rooms.has(roomId)) {
      client.emit('error', { message: 'Game already running' });
      return;
    }

    room.isPlaying = true;
    const seed = Math.floor(Math.random() * 2147483647);

    const onGameOver = (rId: string, winnerId: string | null, stats: any) => {
      const r = this.customRooms.get(rId);
      if (r) {
        if (winnerId) {
          const winner = r.players.find((p) => p.socket.id === winnerId);
          if (winner) winner.wins++;
        }
        this.saveGameStats(rId, winnerId, stats, 'VERSUS', false);
        r.isPlaying = false;
        this.rooms.delete(rId);

        this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
        r.players.forEach((p) => {
          p.socket.emit('custom_room_state', {
            inRoom: true,
            roomId: r.roomId,
            name: r.name,
            isOwner: r.ownerSocketId === p.socket.id,
            players: r.players.map((pl) => ({
              socketId: pl.socket.id,
              userId: pl.userId,
              username: pl.username,
              wins: pl.wins,
            })),
            isPlaying: false,
          });
        });
      }
    };

    const instance = new GameInstance(
      roomId,
      this.server,
      seed,
      onGameOver,
      this.aiAgentService,
    );
    const users: Record<string, { username: string | null }> = {};
    const displayNames: Record<string, string> = {};
    const playersArray: string[] = [];
    room.players.forEach((p, idx) => {
      instance.addPlayer(p.socket.id, p.userId);
      users[p.socket.id] = { username: p.username };
      displayNames[p.socket.id] = p.username ? p.username : (p.userId ? p.userId : `Player ${idx + 1}`);
      playersArray.push(p.socket.id);
    });

    this.rooms.set(roomId, instance);

    this.server.to(roomId).emit(ServerEvent.MATCH_FOUND, {
      roomId,
      seed,
      players: playersArray,
      displayNames,
      users,
    });

    instance.prepareHumanMatch();
  }

  // ── AI 対戦開始 ───────────────────────────────────────────
  @SubscribeMessage('game:start_vs_ai')
  handleStartVsAi(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { difficulty?: unknown; actionDelayMs?: unknown },
  ) {
    if (!isAiDifficulty(data?.difficulty)) {
      client.emit(ServerEvent.ERROR, { message: 'Invalid AI difficulty' });
      return;
    }
    const difficulty = data.difficulty;

    const roomId = `ai_${Date.now()}_${client.id}`;
    const seed = Math.floor(Math.random() * 2147483647);

    const onGameOver = (rId: string, winnerId: string | null, stats: any) => {
      this.saveGameStats(rId, winnerId, stats, 'AI', true, difficulty);
      this.rooms.delete(rId);
    };

    const instance = new GameInstance(
      roomId,
      this.server,
      seed,
      onGameOver,
      this.aiAgentService,
    );

    const userId = (client.data?.userId as string) ?? null;
    instance.addPlayer(client.id, userId);
    instance.addPlayer(`ai_${roomId}`, null); // AI プレイヤー

    client.join(roomId);
    this.clientRoom.set(client.id, roomId);
    this.rooms.set(roomId, instance);

    client.emit(ServerEvent.MATCH_FOUND, { roomId, seed, vsAi: true });
    const actionDelayMs = this.clampInteger(data.actionDelayMs, 50, 0, 1000);
    instance.start(difficulty, actionDelayMs);
  }

  @SubscribeMessage('game:ai_ready')
  handleAiReady(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId?: string }) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId || data?.roomId !== roomId) return;
    this.rooms.get(roomId)?.confirmAiReady(client.id);
  }

  // ── C++ AI Webプレビュー ──────────────────────────────────
  @SubscribeMessage(ClientEvent.START_AI_PREVIEW)
  handleStartAiPreview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: AiPreviewStartRequest,
  ) {
    const allowedModels: AiAgentModel[] = ['easy', 'hard', 'expert'];
    const mode = data?.mode === 'versus' ? 'versus' : 'solo';
    const model = allowedModels.includes(data?.model) ? data.model : null;
    if (!model) {
      client.emit(ServerEvent.ERROR, {
        message: 'model must be easy, hard, or expert',
      });
      return;
    }
    const opponentModel =
      mode === 'versus' &&
      allowedModels.includes(data?.opponentModel as AiAgentModel)
        ? (data.opponentModel as AiAgentModel)
        : mode === 'versus'
          ? 'expert'
          : undefined;

    const previousRoomId = this.clientRoom.get(client.id);
    if (previousRoomId) {
      this.rooms.get(previousRoomId)?.stop();
      this.rooms.delete(previousRoomId);
      client.leave(previousRoomId);
    }

    const thinkTimeMs = this.clampInteger(data.thinkTimeMs, 50, 1, 5000);
    const actionDelayMs = this.clampInteger(data.actionDelayMs, 100, 0, 1000);
    const seed = this.clampInteger(
      data.seed,
      Math.floor(Math.random() * 0x100000000),
      0,
      0xffffffff,
    );
    const roomId = `ai_preview_${Date.now()}_${client.id}`;
    const executable =
      process.env.AI_AGENT_PATH ??
      resolve(process.cwd(), '../../build/ai-agent/ai_agent');

    const instance = new GameInstance(
      roomId,
      this.server,
      seed,
      (finishedRoomId) => {
        this.rooms.delete(finishedRoomId);
        if (this.clientRoom.get(client.id) === finishedRoomId) {
          this.clientRoom.delete(client.id);
        }
      },
    );
    instance.addCppPreviewPlayer(`ai_preview_left_${roomId}`, 'left', model);
    if (mode === 'versus' && opponentModel) {
      instance.addCppPreviewPlayer(
        `ai_preview_right_${roomId}`,
        'right',
        opponentModel,
      );
    }
    client.join(roomId);
    this.clientRoom.set(client.id, roomId);
    this.rooms.set(roomId, instance);
    client.emit(ServerEvent.MATCH_FOUND, {
      roomId,
      seed,
      aiPreview: true,
      mode,
      model,
      opponentModel,
    });

    void instance.startCppPreview({
      executable,
      mode,
      model,
      opponentModel,
      thinkTimeMs,
      responseTimeoutMs: thinkTimeMs * 4 + 500,
      actionDelayMs,
    });
  }

  @SubscribeMessage(ClientEvent.SET_AI_PREVIEW_SPEED)
  handleSetAiPreviewSpeed(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { actionDelayMs?: number },
  ) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    this.rooms
      .get(roomId)
      ?.setCppPreviewActionDelay(
        this.clampInteger(data?.actionDelayMs, 100, 0, 1000),
      );
  }

  @SubscribeMessage(ClientEvent.STOP_AI_PREVIEW)
  handleStopAiPreview(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    this.rooms.get(roomId)?.stop();
    this.rooms.delete(roomId);
    this.clientRoom.delete(client.id);
    client.leave(roomId);
  }

  // ── ゲーム入力 ────────────────────────────────────────────
  @SubscribeMessage(ClientEvent.MOVE_LEFT)
  handleMoveLeft(
    @ConnectedSocket() client: Socket,
    @MessageBody() input?: GameInput,
  ) {
    this.routeInput(client.id, ClientEvent.MOVE_LEFT, input);
  }

  @SubscribeMessage(ClientEvent.MOVE_RIGHT)
  handleMoveRight(
    @ConnectedSocket() client: Socket,
    @MessageBody() input?: GameInput,
  ) {
    this.routeInput(client.id, ClientEvent.MOVE_RIGHT, input);
  }

  @SubscribeMessage(ClientEvent.ROTATE_CW)
  handleRotateCw(
    @ConnectedSocket() client: Socket,
    @MessageBody() input?: GameInput,
  ) {
    this.routeInput(client.id, ClientEvent.ROTATE_CW, input);
  }

  @SubscribeMessage(ClientEvent.ROTATE_CCW)
  handleRotateCcw(
    @ConnectedSocket() client: Socket,
    @MessageBody() input?: GameInput,
  ) {
    this.routeInput(client.id, ClientEvent.ROTATE_CCW, input);
  }

  @SubscribeMessage(ClientEvent.ROTATE_180)
  handleRotate180(
    @ConnectedSocket() client: Socket,
    @MessageBody() input?: GameInput,
  ) {
    this.routeInput(client.id, ClientEvent.ROTATE_180, input);
  }

  @SubscribeMessage(ClientEvent.SOFT_DROP)
  handleSoftDrop(
    @ConnectedSocket() client: Socket,
    @MessageBody() input?: GameInput,
  ) {
    this.routeInput(client.id, ClientEvent.SOFT_DROP, input);
  }

  @SubscribeMessage(ClientEvent.HARD_DROP)
  handleHardDrop(
    @ConnectedSocket() client: Socket,
    @MessageBody() input?: GameInput,
  ) {
    this.routeInput(client.id, ClientEvent.HARD_DROP, input);
  }

  @SubscribeMessage(ClientEvent.HOLD)
  handleHold(
    @ConnectedSocket() client: Socket,
    @MessageBody() input?: GameInput,
  ) {
    this.routeInput(client.id, ClientEvent.HOLD, input);
  }

  private routeInput(socketId: string, event: string, input?: GameInput): void {
    // clientGameRoom を優先（トーナメント中など）、なければ clientRoom を使う
    const gameRoomId = this.clientGameRoom.get(socketId);
    const roomId = this.clientRoom.get(socketId);
    const room =
      (gameRoomId ? this.rooms.get(gameRoomId) : null) ??
      (roomId ? this.rooms.get(roomId) : null);
    if (!room) return;
    if (room.isAiMatch) {
      room.applyInput(socketId, event);
      return;
    }
    if (
      !input ||
      input.roomId !==
        (gameRoomId && this.rooms.has(gameRoomId) ? gameRoomId : roomId) ||
      !Number.isSafeInteger(input.pieceId) ||
      input.pieceId < 0
    )
      return;
    room.applyInput(socketId, event, input.pieceId);
  }

  private clampInteger(
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
  }

  // ── P2P 通信 (フロントエンド主導の対戦用) ───────────────────
  @SubscribeMessage('board_update')
  handleBoardUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { stage: Cell[][]; score: number },
  ) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const gameRoomId = this.clientGameRoom.get(client.id) ?? roomId;
    const instance = this.rooms.get(gameRoomId);
    // Human multiplayer is authoritative. Never accept a browser snapshot
    // as a second source of truth or let a spectator publish a board.
    if (
      !instance ||
      !instance.isAiMatch ||
      !instance.getPlayers().has(client.id)
    )
      return;
    client
      .to(gameRoomId)
      .emit('opponent_board_update', { ...data, playerId: client.id });

    // AI戦の場合、AI側に人間の盤面状態を伝えるためにGameInstanceを更新する
    const room = this.rooms.get(gameRoomId);
    if (room && room.isAiMatch) {
      room.updatePlayerBoard(client.id, data.stage, data.score);
    }
  }

  @SubscribeMessage('send_garbage')
  handleSendGarbage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lines: number; generated?: number },
  ) {
    // clientGameRoom を優先（トーナメント中など）、なければ clientRoom を使う
    const gameRoomId = this.clientGameRoom.get(client.id);
    const roomId = this.clientRoom.get(client.id);

    // GameInstance が動いているルームを特定する（gameRoomId → roomId の順で探す）
    const gameRoom =
      (gameRoomId ? this.rooms.get(gameRoomId) : null) ??
      (roomId ? this.rooms.get(roomId) : null);

    if (gameRoom) {
      if (!gameRoom.isAiMatch) return;
      gameRoom.receiveGarbageFromClient(client.id, data.lines, data.generated);
      return;
    }

    // fallback (P2P mode): 同じルームにいる相手にのみ転送
    if (roomId) {
      client.to(roomId).emit('receive_garbage', data);
    }
  }

  @SubscribeMessage('game_over')
  async handleGameOverEvent(
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true }> {
    // clientGameRoom を優先（トーナメント中など）、なければ clientRoom を使う
    const gameRoomId = this.clientGameRoom.get(client.id);
    const roomId = this.clientRoom.get(client.id);

    const instance =
      (gameRoomId ? this.rooms.get(gameRoomId) : null) ??
      (roomId ? this.rooms.get(roomId) : null);

    if (instance) {
      if (instance.isAiMatch) {
        await instance.handleClientGameOver(client.id);
      } else {
        // This event is an explicit forfeit (ESC/back), not a transport
        // disconnect. A player may always concede their own match.
        await instance.handleGameOver(client.id);
      }
    }
    return { ok: true };
  }

  /**
   * CUSTOM_ROOMS プレイヤーがゲーム中に ESC などで退出した際に呼ばれる。
   * 通常の game_over とは異なり、カスタムルーム自体には残留させる。
   * - ゲームインスタンスに対してゲームオーバーを通知し相手に勝利判定を与える
   * - clientGameRoom マッピングを削除しゲームルームから離脱する
   * - カスタムルームの最新状態をクライアントに返す
   */
  @SubscribeMessage('game:quit_game_room')
  async handleQuitGameRoom(@ConnectedSocket() client: Socket) {
    const gameRoomId = this.clientGameRoom.get(client.id);
    const roomId = this.clientRoom.get(client.id);

    const targetRoomId = gameRoomId ?? roomId;

    if (targetRoomId) {
      const instance = this.rooms.get(targetRoomId);
      if (instance) {
        instance.removeSpectator(client.id);
        await instance.handleGameOver(client.id);
      }
    }

    if (gameRoomId) {
      this.clientGameRoom.delete(client.id);
      client.leave(gameRoomId);
    }

    // カスタムルームの最新状態をクライアントに送り返す（isPlaying が正しく反映される）
    if (roomId) {
      const customRoom = this.customRooms.get(roomId);
      if (customRoom) {
        client.emit('custom_room_state', {
          inRoom: true,
          roomId: customRoom.roomId,
          name: customRoom.name,
          isOwner: customRoom.ownerSocketId === client.id,
          players: customRoom.players.map((pl) => ({
            socketId: pl.socket.id,
            userId: pl.userId,
            username: pl.username,
            wins: pl.wins,
          })),
          isPlaying: customRoom.isPlaying,
          tournament: customRoom.tournament,
        });
      }
    }
  }


  @SubscribeMessage(ClientEvent.SPECTATE)
  handleSpectate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId?: string },
  ) {
    let targetRoomId = data?.roomId;
    if (!targetRoomId) {
      targetRoomId = this.clientRoom.get(client.id);
    }
    if (!targetRoomId) {
      client.emit(ServerEvent.ERROR, { message: 'ルームが見つかりません' });
      return;
    }

    let gameRoomId: string = targetRoomId;
    let room = this.rooms.get(gameRoomId);

    if (!room) {
      // Try to find if it's a custom room ID
      const customRoom = this.customRooms.get(targetRoomId);
      if (customRoom && customRoom.isPlaying && customRoom.tournament) {
        const activeMatch = customRoom.tournament.matches.find(
          (m) => m.isPlaying,
        );
        if (activeMatch) {
          gameRoomId = `${targetRoomId}_${activeMatch.id}`;
          room = this.rooms.get(gameRoomId);
        }
      }
    }

    if (!room) {
      client.emit(ServerEvent.ERROR, { message: 'ルームが見つかりません' });
      return;
    }

    const previousId = this.clientGameRoom.get(client.id);
    const previous = previousId ? this.rooms.get(previousId) : undefined;
    if (
      previous?.isActive() &&
      previous.getPlayers().get(client.id)?.isGameOver === false
    ) {
      client.emit(ServerEvent.ERROR, {
        message: '対戦中は観戦へ切り替えられません',
      });
      return;
    }
    if (previousId) {
      previous?.removeSpectator(client.id);
      client.leave(previousId);
    }
    this.clientGameRoom.set(client.id, gameRoomId);
    client.join(gameRoomId);
    room.addSpectator(client.id);
    const customRoom = this.customRooms.get(targetRoomId);
    let displayNames: Record<string, string> | undefined = undefined;
    let playersArr: string[] | undefined = undefined;
    if (customRoom) {
      displayNames = {};
      customRoom.players.forEach((p, idx) => {
        displayNames![p.socket.id] = p.username ? p.username : (p.userId ? p.userId : `Player ${idx + 1}`);
      });
      if (customRoom.tournament) {
        const activeMatch = customRoom.tournament.matches.find(m => m.isPlaying);
        if (activeMatch) {
          playersArr = activeMatch.playerIds;
        }
      } else {
        playersArr = customRoom.players.map(p => p.socket.id);
      }
    }

    client.emit('spectating', {
      roomId: gameRoomId,
      displayNames,
      players: playersArr,
      isStarted: room.isStarted
    });
    room.broadcastSnapshot();
  }

  // ── チャット ──────────────────────────────────────────────
  @SubscribeMessage('chat:join')
  async handleJoinChatRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data?.userId;
    if (typeof userId !== 'string') {
      client.emit(ServerEvent.ERROR, { message: 'チャットには認証が必要です' });
      return;
    }

    try {
      await this.chatService.assertCanAccessRoom(data.roomId, userId);
      const previousRoomId = this.clientChatRoom.get(client.id);
      if (previousRoomId && previousRoomId !== data.roomId) {
        client.leave(previousRoomId);
      }
      client.join(data.roomId);
      this.clientChatRoom.set(client.id, data.roomId);
      this.logger.log(`Client ${client.id} joined chat room ${data.roomId}`);
    } catch {
      client.emit(ServerEvent.ERROR, {
        message: 'チャットルームへのアクセス権がありません',
      });
    }
  }

  @SubscribeMessage(ClientEvent.CHAT_MESSAGE)
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; content: string },
  ) {
    if (!data.content?.trim()) return;
    const userId = client.data?.userId;
    if (typeof userId !== 'string') {
      client.emit(ServerEvent.ERROR, { message: 'チャットには認証が必要です' });
      return;
    }

    try {
      const savedMsg = await this.chatService.saveMessage(
        data.roomId,
        userId,
        data.content.trim().substring(0, 500),
      );
      const message = {
        id: savedMsg.id,
        roomId: data.roomId,
        senderId: savedMsg.senderId,
        sender: savedMsg.sender,
        content: savedMsg.content,
        timestamp: savedMsg.createdAt.getTime(),
      };
      this.server.to(data.roomId).emit(ServerEvent.CHAT_MESSAGE, message);
    } catch (error) {
      this.logger.error('Failed to save message', error);
      client.emit(ServerEvent.ERROR, {
        message: 'メッセージを送信できませんでした',
      });
    }
  }
}
