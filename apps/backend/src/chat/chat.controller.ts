import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('rooms/direct')
  async createDirectRoom(@CurrentUser() user: any, @Body() body: { targetUserId: string }) {
    return this.chatService.getOrCreateDirectRoom(user.id, body.targetUserId);
  }

  @Get('rooms')
  async getRooms(@CurrentUser() user: any) {
    return this.chatService.getUserRooms(user.id);
  }

  @Get('rooms/:id/messages')
  async getRoomMessages(@Param('id') roomId: string) {
    return this.chatService.getMessages(roomId);
  }
}
