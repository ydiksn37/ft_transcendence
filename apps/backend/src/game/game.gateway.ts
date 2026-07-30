import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { ClientEvent, ServerEvent, AiDifficulty } from '@transcendence/shared';
import { GameInstance } from './game-instance';
import { GameService } from './game.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);
  private rooms = new Map<string, GameInstance>();
  private clientRoom = new Map<string, string>(); // socketId -> roomId
  private matchmakingQueue: Socket[] = [];

  constructor(private readonly gameService: GameService) {}

  handleConnection(client: Socket) {
    this.logger.log(`接続: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`切断: ${client.id}`);

    // マッチメイキングキューから除外
    this.matchmakingQueue = this.matchmakingQueue.filter((s) => s.id !== client.id);

    // ゲーム中だった場合
    const roomId = this.clientRoom.get(client.id);
    if (roomId) {
      client.to(roomId).emit('opponent_disconnected');
      const room = this.rooms.get(roomId);
      if (room) {
        room.stop();
        this.rooms.delete(roomId);
      }
      this.clientRoom.delete(client.id);
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

      const instance = new GameInstance(roomId, this.server, seed);

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
    this.matchmakingQueue = this.matchmakingQueue.filter((s) => s.id !== client.id);
    client.emit('queue_left');
  }

  // ── AI 対戦開始 ───────────────────────────────────────────
  @SubscribeMessage('game:start_vs_ai')
  handleStartVsAi(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { difficulty: AiDifficulty },
  ) {
    const roomId = `ai_${Date.now()}_${client.id}`;
    const seed = Math.floor(Math.random() * 2147483647);
    const instance = new GameInstance(roomId, this.server, seed);

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
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; content: string },
  ) {
    if (!data.content?.trim()) return;
    const message = {
      senderId: client.id,
      content: data.content.trim().substring(0, 500),
      timestamp: Date.now(),
    };
    this.server.to(data.roomId).emit(ServerEvent.CHAT_MESSAGE, message);
  }
}
