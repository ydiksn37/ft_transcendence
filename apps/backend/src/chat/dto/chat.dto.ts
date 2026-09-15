import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateDirectRoomDto {
  @ApiProperty()
  @IsUUID()
  targetUserId!: string;
}
