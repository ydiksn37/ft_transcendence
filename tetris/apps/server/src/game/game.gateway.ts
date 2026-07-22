import { SubscribeMessage, WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, WebSocketServer, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private waitingClient: Socket | null = null;
  private rooms = new Map<string, string[]>(); // roomId -> [clientId1, clientId2]
  private clientRoom = new Map<string, string>(); // clientId -> roomId

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    if (this.waitingClient && this.waitingClient.id === client.id) {
      this.waitingClient = null;
    }

    const roomId = this.clientRoom.get(client.id);
    if (roomId) {
      client.to(roomId).emit('opponent_disconnected');
      this.server.socketsLeave(roomId);
      this.clientRoom.delete(client.id);
      this.rooms.delete(roomId);
    }
  }

  @SubscribeMessage('join_matchmaking')
  handleJoinMatchmaking(@ConnectedSocket() client: Socket) {
    if (this.waitingClient && this.waitingClient.id !== client.id) {
      // Match found
      const roomId = `room_${Math.random().toString(36).substring(7)}`;
      
      const opponent = this.waitingClient;
      this.waitingClient = null;

      client.join(roomId);
      opponent.join(roomId);

      this.clientRoom.set(client.id, roomId);
      this.clientRoom.set(opponent.id, roomId);
      this.rooms.set(roomId, [client.id, opponent.id]);

      // Notify both players with a shared random seed for identical tetromino sequences
      const seed = Math.floor(Math.random() * 2147483647);
      client.emit('match_found', { playerNum: 2, seed });
      opponent.emit('match_found', { playerNum: 1, seed });
    } else {
      // Wait for match
      this.waitingClient = client;
      client.emit('waiting_for_match');
    }
  }

  @SubscribeMessage('board_update')
  handleBoardUpdate(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const roomId = this.clientRoom.get(client.id);
    if (roomId) {
      client.to(roomId).emit('opponent_board_update', data);
    }
  }

  @SubscribeMessage('send_garbage')
  handleSendGarbage(@ConnectedSocket() client: Socket, @MessageBody() data: { lines: number }) {
    const roomId = this.clientRoom.get(client.id);
    if (roomId) {
      client.to(roomId).emit('receive_garbage', data);
    }
  }

  @SubscribeMessage('game_over')
  handleGameOver(@ConnectedSocket() client: Socket) {
    const roomId = this.clientRoom.get(client.id);
    if (roomId) {
      client.to(roomId).emit('opponent_game_over');
    }
  }
}
