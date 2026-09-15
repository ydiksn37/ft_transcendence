import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { CreateDirectRoomDto } from './dto/chat.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('rooms/direct')
  async createDirectRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateDirectRoomDto,
  ) {
    return this.chatService.getOrCreateDirectRoom(user.id, body.targetUserId);
  }

  @Get('rooms')
  async getRooms(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.getUserRooms(user.id);
  }

  @Get('rooms/:id/messages')
  async getRoomMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) roomId: string,
  ) {
    return this.chatService.getMessages(roomId, user.id);
  }
}
