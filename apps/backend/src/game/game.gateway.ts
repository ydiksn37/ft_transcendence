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
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { resolve } from 'node:path';
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
    username: string | null;
    wins: number;
  }[];
  isPlaying: boolean;
  tournament?: Tournament;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);
  private rooms = new Map<string, GameInstance>();
  private clientRoom = new Map<string, string>(); // socketId -> roomId
  private clientGameRoom = new Map<string, string>(); // socketId -> gameRoomId
  private matchmakingQueue: Socket[] = [];

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
    if (typeof token === 'string' && token.length > 0) {
      try {
        const payload = this.jwtService.verify<{ sub: string }>(token);
        if (typeof payload.sub === 'string') {
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
    this.logger.log(`接続: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`切断: ${client.id}`);

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

    // ゲーム中だった場合
    const roomId = this.clientRoom.get(client.id);
    const gameRoomId = this.clientGameRoom.get(client.id);

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
        activeRoom.players = activeRoom.players.filter(
          (p) => p.socket.id !== client.id,
        );
        if (activeRoom.players.length === 0) {
          this.customRooms.delete(roomId);
        } else {
          if (activeRoom.ownerSocketId === client.id) {
            activeRoom.ownerSocketId = activeRoom.players[0].socket.id;
          }
          activeRoom.players.forEach((p) => {
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
            });
          });
        }
        this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
      }
      this.clientRoom.delete(client.id);
    }

    // カスタムルームのクリーンアップは上記で処理されるため省略
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

      this.server.to(roomId).emit(ServerEvent.MATCH_FOUND, {
        roomId,
        seed,
        player1: opponent.id,
        player2: client.id,
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
          username: (client.data?.username as string) || null,
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
          username: (client.data?.username as string) || null,
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
    if (room.players.find((p) => p.socket.id === client.id)) {
      client.emit('error', { message: 'すでにルームに参加しています' });
      return;
    }

    room.players.push({
      socket: client,
      userId: (client.data?.userId as string) ?? null,
      username: (client.data?.username as string) ?? null,
      wins: 0,
    });

    client.join(room.roomId);
    this.clientRoom.set(client.id, room.roomId);
    this.server.emit('custom_rooms_updated', this.getCustomRoomsList());

    room.players.forEach((p) => {
      p.socket.emit('custom_room_players_updated', {
        players: room.players.map((pl) => ({
          socketId: pl.socket.id,
          userId: pl.userId,
          username: pl.username,
          wins: pl.wins,
        })),
      });
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
          client.emit('spectating', { roomId: gameRoomId });
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

    const playerIds = room.players.map((p) => p.socket.id);

    // socketId → 表示名 のマップを開始時点で記録（退出後も名前を参照できるように）
    const playerNames: Record<string, string> = {};
    room.players.forEach((p, idx) => {
      playerNames[p.socket.id] = p.username ?? p.userId ?? `Player ${idx + 1}`;
    });

    room.tournament = generateTournamentBracket(playerIds, playerNames);

    // Broadcast tournament state
    room.players.forEach((p) => {
      p.socket.emit('tournament_state', { tournament: room.tournament });
    });

    setTimeout(() => {
      this.startNextTournamentRound(roomId);
    }, 5000);
  }

  @SubscribeMessage('game:clear_tournament')
  handleClearTournament(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (room && room.ownerSocketId === client.id) {
      room.tournament = undefined;
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
            if (!tournament.root.winnerId) {
              setTimeout(() => {
                this.startNextTournamentRound(roomId);
              }, 5000);
            }
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
              instance.addSpectator(p.socket.id);
              this.clientGameRoom.set(p.socket.id, gameRoomId);
              p.socket.join(gameRoomId);
              p.socket.emit('spectating', { roomId: gameRoomId });
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
    room.players.forEach((p) => {
      instance.addPlayer(p.socket.id, p.userId);
    });

    this.rooms.set(roomId, instance);

    this.server.to(roomId).emit(ServerEvent.MATCH_FOUND, {
      roomId,
      seed,
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
    setTimeout(() => instance.start(difficulty, actionDelayMs), 1000);
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
  handleGameOverEvent(@ConnectedSocket() client: Socket) {
    // clientGameRoom を優先（トーナメント中など）、なければ clientRoom を使う
    const gameRoomId = this.clientGameRoom.get(client.id);
    const roomId = this.clientRoom.get(client.id);

    const instance =
      (gameRoomId ? this.rooms.get(gameRoomId) : null) ??
      (roomId ? this.rooms.get(roomId) : null);

    if (instance) {
      if (instance.isAiMatch) {
        instance.handleClientGameOver(client.id);
      }
    }
  }

  // ── 観戦 ─────────────────────────────────────────────────
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
    client.emit('spectating', { roomId: gameRoomId });
    room.broadcastSnapshot();
  }

  // ── チャット ──────────────────────────────────────────────
  @SubscribeMessage('chat:join')
  handleJoinChatRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    if (data.roomId) {
      client.join(data.roomId);
      this.logger.log(`Client ${client.id} joined chat room ${data.roomId}`);
    }
  }

  @SubscribeMessage(ClientEvent.CHAT_MESSAGE)
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; content: string },
  ) {
    if (!data.content?.trim()) return;
    const userId = (client.data?.userId as string) || client.id;

    try {
      const savedMsg = await this.chatService.saveMessage(
        data.roomId,
        userId,
        data.content.trim().substring(0, 500),
      );
      const message = {
        id: savedMsg.id,
        senderId: savedMsg.senderId,
        sender: savedMsg.sender,
        content: savedMsg.content,
        timestamp: savedMsg.createdAt.getTime(),
      };
      this.server.to(data.roomId).emit(ServerEvent.CHAT_MESSAGE, message);
    } catch (error) {
      this.logger.error('Failed to save message', error);
      // Fallback
      const message = {
        senderId: userId,
        content: data.content.trim().substring(0, 500),
        timestamp: Date.now(),
      };
      this.server.to(data.roomId).emit(ServerEvent.CHAT_MESSAGE, message);
    }
  }
}
