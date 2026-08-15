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
import { ClientEvent, ServerEvent, AiDifficulty, Cell } from '@transcendence/shared';
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
  
  // Custom Rooms
  private customRooms = new Map<string, {
    roomId: string;
    name: string;
    ownerSocketId: string;
    players: {
      socket: Socket;
      userId: string | null;
      wins: number;
    }[];
    isPlaying: boolean;
  }>();

  constructor(private readonly gameService: GameService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake?.auth?.userId;
    if (userId) {
      client.data = client.data || {};
      client.data.userId = userId;
    }
    this.logger.log(`接続: ${client.id} (User: ${userId || 'anonymous'})`);
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
      
      const activeRoom = this.customRooms.get(roomId);
      if (activeRoom) {
        activeRoom.players = activeRoom.players.filter(p => p.socket.id !== client.id);
        if (activeRoom.players.length === 0) {
          this.customRooms.delete(roomId);
        } else {
          if (activeRoom.ownerSocketId === client.id) {
            activeRoom.ownerSocketId = activeRoom.players[0].socket.id;
          }
          activeRoom.players.forEach(p => {
            p.socket.emit('custom_room_state', {
              inRoom: true,
              roomId: activeRoom.roomId,
              name: activeRoom.name,
              isOwner: activeRoom.ownerSocketId === p.socket.id,
              players: activeRoom.players.map(pl => ({ socketId: pl.socket.id, userId: pl.userId, wins: pl.wins })),
              isPlaying: activeRoom.isPlaying
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
    return Array.from(this.customRooms.values()).map(r => ({
      roomId: r.roomId,
      name: r.name,
ownerId: r.ownerSocketId
    }));
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

  // ── カスタムルーム (マルチプレイ) ──────────────────────────
  @SubscribeMessage('game:create_custom_room')
  handleCreateCustomRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { name?: string }) {
    // 既存の自分のルームがあれば削除（1人1ルーム）
    for (const [rId, room] of this.customRooms.entries()) {
      if (room.ownerSocketId === client.id) {
        this.customRooms.delete(rId);
      }
    }

    const roomId = Math.random().toString(36).slice(2, 6).toUpperCase();
    
    if (this.customRooms.has(roomId)) {
      client.emit('error', { message: 'Failed to generate unique Room ID. Please try again.' });
      return;
    }

    const roomName = data?.name?.trim() || `Room ${roomId}`;
    
    this.customRooms.set(roomId, {
      roomId,
      name: roomName,
      ownerSocketId: client.id,
      players: [{ socket: client, userId: (client.data?.userId as string) || null, wins: 0 }],
      isPlaying: false
    });

    client.join(roomId);
    this.clientRoom.set(client.id, roomId);
    client.emit('custom_room_created', { 
      roomId, 
      name: roomName,
      players: [{ socketId: client.id, userId: (client.data?.userId as string) || null, wins: 0 }] 
    });
    this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
  }

  @SubscribeMessage('game:update_custom_room_id')
  handleUpdateCustomRoomId(@ConnectedSocket() client: Socket, @MessageBody() data: { newRoomId: string }) {
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
        players: room.players.map(pl => ({ socketId: pl.socket.id, userId: pl.userId, wins: pl.wins })),
        isPlaying: room.isPlaying
      });
    }
  }

  @SubscribeMessage('game:join_custom_room')
  handleJoinCustomRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.customRooms.get(data.roomId);
    if (!room) {
      client.emit('error', { message: 'ルームが見つかりません' });
      return;
    }
    if (room.isPlaying) {
      client.emit('error', { message: 'すでにゲームが進行中です' });
      return;
    }
    if (room.players.find(p => p.socket.id === client.id)) {
      client.emit('error', { message: 'すでにルームに参加しています' });
      return;
    }

    room.players.push({
      socket: client,
      userId: (client.data?.userId as string) ?? null,
      wins: 0
    });

    client.join(room.roomId);
    this.clientRoom.set(client.id, room.roomId);
    this.server.emit('custom_rooms_updated', this.getCustomRoomsList());

    room.players.forEach(p => {
      p.socket.emit('custom_room_players_updated', {
        players: room.players.map(pl => ({ socketId: pl.socket.id, userId: pl.userId, wins: pl.wins }))
      });
    });
  }

  @SubscribeMessage('game:start_custom_room')
  handleStartCustomRoom(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (!room || room.ownerSocketId !== client.id || room.players.length < 2) return;

    if (this.rooms.has(roomId)) {
      client.emit('error', { message: 'Game already running' });
      return;
    }

    room.isPlaying = true;
    const seed = Math.floor(Math.random() * 2147483647);
    
    const onGameOver = (rId: string, winnerId: string | null) => {
      const r = this.customRooms.get(rId);
      if (r) {
        if (winnerId) {
          const winner = r.players.find(p => p.socket.id === winnerId);
          if (winner) winner.wins++;
        }
        r.isPlaying = false;
        this.rooms.delete(rId);
      }
    };

    const instance = new GameInstance(roomId, this.server, seed, onGameOver);
    room.players.forEach(p => {
      instance.addPlayer(p.socket.id, p.userId);
    });
    
    this.rooms.set(roomId, instance);

    this.server.to(roomId).emit(ServerEvent.MATCH_FOUND, {
      roomId,
      seed,
    });

    setTimeout(() => instance.start(), 3000);
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

  // ── P2P 通信 (フロントエンド主導の対戦用) ───────────────────
  @SubscribeMessage('board_update')
  handleBoardUpdate(@ConnectedSocket() client: Socket, @MessageBody() data: { stage: Cell[][]; score: number }) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    client.to(roomId).emit('opponent_board_update', data);
  }

  @SubscribeMessage('send_garbage')
  handleSendGarbage(@ConnectedSocket() client: Socket, @MessageBody() data: { lines: number }) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    client.to(roomId).emit('receive_garbage', data);
  }

  @SubscribeMessage('game_over')
  handleGameOverEvent(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    
    // Always emit opponent_game_over to the other player so they see the WIN screen
    client.to(roomId).emit('opponent_game_over');
    
    // Trigger the server-side game over logic to clean up the room
    const instance = this.rooms.get(roomId);
    if (instance) {
      instance.handleGameOver(client.id);
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
