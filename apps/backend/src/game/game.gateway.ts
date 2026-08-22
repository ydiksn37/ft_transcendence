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
import { JwtService } from '@nestjs/jwt';
import {
  ClientEvent,
  ServerEvent,
  AiDifficulty,
  Cell,
} from '@transcendence/shared';
import { GameInstance } from './game-instance';
import { GameService } from './game.service';
import { ChatService } from '../chat/chat.service';
import { AiAgentService } from './engine/ai-agent.service';

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
  private matchmakingQueue: Socket[] = [];

  // Custom Rooms
  private customRooms = new Map<
    string,
    {
      roomId: string;
      name: string;
      ownerId: string;
      ownerSocket: Socket;
    }
  >();

  private activeCustomRooms = new Map<
    string,
    {
      roomId: string;
      name: string;
      ownerSocket: Socket;
      ownerId: string;
      guestSocket: Socket;
      guestId: string;
      ownerWins: number;
      guestWins: number;
    }
  >();

  constructor(
    private readonly gameService: GameService,
    private readonly chatService: ChatService,
    private readonly aiAgentService: AiAgentService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit() {
    this.logger.log('GameGateway initialized');
  }

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token === 'string' && token.length > 0) {
      try {
        const payload = this.jwtService.verify<{ sub: string }>(token);
        if (typeof payload.sub === 'string') client.data.userId = payload.sub;
      } catch {
        this.logger.warn(`無効なWebSocketトークン: ${client.id}`);
      }
    }
    this.logger.log(`接続: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`切断: ${client.id}`);

    // マッチメイキングキューから除外
    this.matchmakingQueue = this.matchmakingQueue.filter(
      (s) => s.id !== client.id,
    );

    // ゲーム中だった場合
    const roomId = this.clientRoom.get(client.id);
    if (roomId) {
      client.to(roomId).emit('opponent_disconnected');
      const room = this.rooms.get(roomId);
      if (room) {
        room.stop();
        this.rooms.delete(roomId);
      }
      this.activeCustomRooms.delete(roomId);
      this.clientRoom.delete(client.id);
    }

    // カスタムルームのオーナーだった場合ルーム削除
    for (const [cRoomId, room] of this.customRooms.entries()) {
      if (room.ownerSocket.id === client.id) {
        this.customRooms.delete(cRoomId);
        this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
      }
    }
  }

  private getCustomRoomsList() {
    return Array.from(this.customRooms.values()).map((r) => ({
      roomId: r.roomId,
      name: r.name,
      ownerId: r.ownerId,
    }));
  }

  // ── ゲーム履歴保存 ─────────────────────────────────────────
  private async saveGameStats(
    roomId: string,
    winnerSocketId: string | null,
    stats: Record<string, any>,
    gameMode: 'VERSUS' | 'AI' | 'TOURNAMENT',
    isAiGame: boolean,
    aiDifficulty?: string,
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

      const instance = new GameInstance(roomId, this.server, seed, onGameOver, this.aiAgentService);

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
      setTimeout(() => instance.start(), 3000); // 3秒カウントダウン後
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
      if (room.ownerSocket.id === client.id) {
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
      ownerId: (client.data?.userId as string) || client.id,
      ownerSocket: client,
    });

    client.join(roomId);
    client.emit('custom_room_created', { roomId, name: roomName });
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
      if (room.ownerSocket.id === client.id) {
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
    const activeRoom = this.activeCustomRooms.get(roomId);
    if (activeRoom) {
      const isOwner = activeRoom.ownerSocket.id === client.id;
      client.emit('custom_room_state', {
        inRoom: true,
        roomId: activeRoom.roomId,
        name: activeRoom.name,
        isOwner,
        opponentJoined: true,
        ownerWins: activeRoom.ownerWins,
        guestWins: activeRoom.guestWins,
      });
    } else {
      const room = this.customRooms.get(roomId);
      if (room && room.ownerSocket.id === client.id) {
        client.emit('custom_room_state', {
          inRoom: true,
          roomId: room.roomId,
          name: room.name,
          isOwner: true,
          opponentJoined: false,
          ownerWins: 0,
          guestWins: 0,
        });
      }
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

    if (room.ownerSocket.id === client.id) {
      client.emit('error', { message: '自分のルームには参加できません' });
      return;
    }

    // マッチ成立（まだゲームは開始しない、activeCustomRooms に移動）
    const opponent = room.ownerSocket;
    const activeRoom = {
      roomId: room.roomId,
      name: room.name,
      ownerSocket: opponent,
      ownerId: (opponent.data?.userId as string) ?? null,
      guestSocket: client,
      guestId: (client.data?.userId as string) ?? null,
      ownerWins: 0,
      guestWins: 0,
    };
    this.activeCustomRooms.set(room.roomId, activeRoom);

    client.join(room.roomId);
    this.clientRoom.set(opponent.id, room.roomId);
    this.clientRoom.set(client.id, room.roomId);

    this.customRooms.delete(room.roomId); // 募集終了
    this.server.emit('custom_rooms_updated', this.getCustomRoomsList());

    // 部屋にいる全員に相手が参加したことと、現在のスコアを通知
    this.server.to(room.roomId).emit('custom_room_opponent_joined', {
      ownerWins: activeRoom.ownerWins,
      guestWins: activeRoom.guestWins,
    });
  }

  @SubscribeMessage('game:start_custom_room')
  handleStartCustomRoom(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;

    const activeRoom = this.activeCustomRooms.get(roomId);
    if (!activeRoom) return;

    if (this.rooms.has(roomId)) {
      client.emit('error', { message: 'Game already running' });
      return;
    }

    const seed = Math.floor(Math.random() * 2147483647);

    const onGameOver = (rId: string, winnerId: string | null, stats: any) => {
      const room = this.activeCustomRooms.get(rId);
      if (room) {
        if (winnerId === room.ownerSocket.id) room.ownerWins++;
        else if (winnerId === room.guestSocket.id) room.guestWins++;

        this.saveGameStats(rId, winnerId, stats, 'VERSUS', false);

        // ゲーム終了後、結果を保存してルーム状態に戻す
        this.rooms.delete(rId);

        // クライアントへロビーに戻るように通知
        this.server.to(rId).emit('custom_room_returned', {
          ownerWins: room.ownerWins,
          guestWins: room.guestWins,
        });
      }
    };

    const instance = new GameInstance(roomId, this.server, seed, onGameOver, this.aiAgentService);
    instance.addPlayer(activeRoom.ownerSocket.id, activeRoom.ownerId);
    instance.addPlayer(activeRoom.guestSocket.id, activeRoom.guestId);

    this.rooms.set(roomId, instance);

    this.server.to(roomId).emit(ServerEvent.MATCH_FOUND, {
      roomId,
      seed,
    });

    setTimeout(() => instance.start(), 3000); // 3秒後にスタート
  }

  // ── AI 対戦開始 ───────────────────────────────────────────
  @SubscribeMessage('game:start_vs_ai')
  handleStartVsAi(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { difficulty: AiDifficulty },
  ) {
    if (!['EASY', 'MEDIUM', 'HARD'].includes(data?.difficulty)) {
      client.emit(ServerEvent.ERROR, { message: 'Invalid AI difficulty' });
      return;
    }

    const roomId = `ai_${Date.now()}_${client.id}`;
    const seed = Math.floor(Math.random() * 2147483647);

    const onGameOver = (rId: string, winnerId: string | null, stats: any) => {
      this.saveGameStats(rId, winnerId, stats, 'AI', true, data.difficulty);
      this.rooms.delete(rId);
    };

    const instance = new GameInstance(roomId, this.server, seed, onGameOver, this.aiAgentService);

    const userId = (client.data?.userId as string) ?? null;
    instance.addPlayer(client.id, userId);
    instance.addPlayer(`ai_${roomId}`, null); // AI プレイヤー

    client.join(roomId);
    this.clientRoom.set(client.id, roomId);
    this.rooms.set(roomId, instance);

    client.emit(ServerEvent.MATCH_FOUND, { roomId, seed, vsAi: true });
    setTimeout(() => instance.start(data.difficulty), 1000);
  }

  // ── ゲーム入力 ────────────────────────────────────────────
  @SubscribeMessage(ClientEvent.MOVE_LEFT)
  handleMoveLeft(@ConnectedSocket() client: Socket) {
    this.routeInput(client.id, ClientEvent.MOVE_LEFT);
  }

  @SubscribeMessage(ClientEvent.MOVE_RIGHT)
  handleMoveRight(@ConnectedSocket() client: Socket) {
    this.routeInput(client.id, ClientEvent.MOVE_RIGHT);
  }

  @SubscribeMessage(ClientEvent.ROTATE_CW)
  handleRotateCw(@ConnectedSocket() client: Socket) {
    this.routeInput(client.id, ClientEvent.ROTATE_CW);
  }

  @SubscribeMessage(ClientEvent.ROTATE_CCW)
  handleRotateCcw(@ConnectedSocket() client: Socket) {
    this.routeInput(client.id, ClientEvent.ROTATE_CCW);
  }

  @SubscribeMessage(ClientEvent.ROTATE_180)
  handleRotate180(@ConnectedSocket() client: Socket) {
    this.routeInput(client.id, ClientEvent.ROTATE_180);
  }

  @SubscribeMessage(ClientEvent.SOFT_DROP)
  handleSoftDrop(@ConnectedSocket() client: Socket) {
    this.routeInput(client.id, ClientEvent.SOFT_DROP);
  }

  @SubscribeMessage(ClientEvent.HARD_DROP)
  handleHardDrop(@ConnectedSocket() client: Socket) {
    this.routeInput(client.id, ClientEvent.HARD_DROP);
  }

  @SubscribeMessage(ClientEvent.HOLD)
  handleHold(@ConnectedSocket() client: Socket) {
    this.routeInput(client.id, ClientEvent.HOLD);
  }

  private routeInput(socketId: string, event: string): void {
    const roomId = this.clientRoom.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    room?.applyInput(socketId, event);
  }

  // ── P2P 通信 (フロントエンド主導の対戦用) ───────────────────
  @SubscribeMessage('board_update')
  handleBoardUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { stage: Cell[][]; score: number },
  ) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    client.to(roomId).emit('opponent_board_update', data);
  }

  @SubscribeMessage('send_garbage')
  handleSendGarbage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lines: number },
  ) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    client.to(roomId).emit('receive_garbage', data);

    const room = this.rooms.get(roomId);
    if (room && room.isAiMatch) {
      room.receiveGarbageFromClient(client.id, data.lines);
    }
  }

  @SubscribeMessage('game_over')
  handleGameOverEvent(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    client.to(roomId).emit('opponent_game_over');

    const room = this.rooms.get(roomId);
    if (room && room.isAiMatch) {
      room.handleClientGameOver(client.id);
    }
  }

  // ── 観戦 ─────────────────────────────────────────────────
  @SubscribeMessage(ClientEvent.SPECTATE)
  handleSpectate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room) {
      client.emit(ServerEvent.ERROR, { message: 'ルームが見つかりません' });
      return;
    }
    client.join(data.roomId);
    room.addSpectator(client.id);
    client.emit('spectating', { roomId: data.roomId });
  }

  // ── チャット ──────────────────────────────────────────────
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
