const fs = require('fs');
let code = fs.readFileSync('apps/backend/src/game/game.gateway.ts', 'utf8');

// 1. Add clientGameRoom
code = code.replace(
  'private clientRoom = new Map<string, string>(); // socketId -> roomId',
  'private clientRoom = new Map<string, string>(); // socketId -> roomId\n  private clientGameRoom = new Map<string, string>(); // socketId -> gameRoomId'
);

// 2. handleBoardUpdate
code = code.replace(
  `  @SubscribeMessage('board_update')
  handleBoardUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { stage: Cell[][]; score: number },
  ) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    client.to(roomId).emit('opponent_board_update', { ...data, playerId: client.id });
    
    // AI戦の場合、AI側に人間の盤面状態を伝えるためにGameInstanceを更新する
    const room = this.rooms.get(roomId);
    if (room && room.isAiMatch) {
      room.updatePlayerBoard(client.id, data.stage, data.score);
    }
  }`,
  `  @SubscribeMessage('board_update')
  handleBoardUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { stage: Cell[][]; score: number },
  ) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const gameRoomId = this.clientGameRoom.get(client.id) ?? roomId;
    client.to(gameRoomId).emit('opponent_board_update', { ...data, playerId: client.id });
    
    // AI戦の場合、AI側に人間の盤面状態を伝えるためにGameInstanceを更新する
    const room = this.rooms.get(gameRoomId);
    if (room && room.isAiMatch) {
      room.updatePlayerBoard(client.id, data.stage, data.score);
    }
  }`
);

// 3. handleSendGarbage
code = code.replace(
  `  @SubscribeMessage('send_garbage')
  handleSendGarbage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lines: number; generated: boolean },
  ) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;

    // GameInstanceが存在する場合(トーナメント/AI等)
    const room = this.rooms.get(roomId);
    if (room) {
      room.receiveGarbageFromClient(client.id, data.lines, data.generated);
      return;
    }

    // fallback (1v1 P2P mode)
    client.to(roomId).emit('receive_garbage', data);
  }`,
  `  @SubscribeMessage('send_garbage')
  handleSendGarbage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lines: number; generated: boolean },
  ) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const gameRoomId = this.clientGameRoom.get(client.id) ?? roomId;

    // GameInstanceが存在する場合(トーナメント/AI等)
    const room = this.rooms.get(gameRoomId);
    if (room) {
      room.receiveGarbageFromClient(client.id, data.lines, data.generated);
      return;
    }

    // fallback (1v1 P2P mode)
    client.to(gameRoomId).emit('receive_garbage', data);
  }`
);

// 4. handleGameOverEvent
code = code.replace(
  `  @SubscribeMessage('game_over')
  handleGameOverEvent(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.handleGameOver(client.id);
      return;
    }

    client.to(roomId).emit('opponent_game_over');
  }`,
  `  @SubscribeMessage('game_over')
  handleGameOverEvent(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const gameRoomId = this.clientGameRoom.get(client.id) ?? roomId;

    const room = this.rooms.get(gameRoomId);
    if (room) {
      room.handleGameOver(client.id);
      return;
    }

    client.to(gameRoomId).emit('opponent_game_over');
  }`
);

// 5. handleStartCustomRoom
code = code.replace(
  `  @SubscribeMessage('game:start_custom_room')
  handleStartCustomRoom(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (!room || room.ownerSocketId !== client.id || room.players.length < 2) return;`,
  `  @SubscribeMessage('game:start_custom_room')
  handleStartCustomRoom(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (!room || room.ownerSocketId !== client.id || room.players.length < 2 || room.players.length > 3) return;`
);

// 6. routeInput
code = code.replace(
  `  private routeInput(socketId: string, event: string) {
    const roomId = this.clientRoom.get(socketId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room && room.isAiMatch) {
      room.handlePlayerInput(socketId, event);
    }
  }`,
  `  private routeInput(socketId: string, event: string) {
    const roomId = this.clientRoom.get(socketId);
    if (!roomId) return;
    const gameRoomId = this.clientGameRoom.get(socketId) ?? roomId;

    const room = this.rooms.get(gameRoomId);
    if (room && room.isAiMatch) {
      room.handlePlayerInput(socketId, event);
    }
  }`
);

// 7. handleClearTournament
code = code.replace(
  `  @SubscribeMessage('game:start_tournament_match')`,
  `  @SubscribeMessage('game:clear_tournament')
  handleClearTournament(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (!roomId) return;
    const room = this.customRooms.get(roomId);
    if (room && room.ownerSocketId === client.id) {
      room.tournament = undefined;
      room.players.forEach(p => {
        p.socket.emit('tournament_state', { tournament: undefined });
        p.socket.emit('custom_room_state', {
          inRoom: true,
          roomId: room.roomId,
          name: room.name,
          isOwner: room.ownerSocketId === p.socket.id,
          players: room.players.map(pl => ({ socketId: pl.socket.id, userId: pl.userId, username: pl.username, wins: pl.wins })),
          isPlaying: room.isPlaying,
          tournament: undefined
        });
      });
      this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
    }
  }

  @SubscribeMessage('game:start_tournament_match')`
);

fs.writeFileSync('apps/backend/src/game/game.gateway.ts', code);
