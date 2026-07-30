import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2faDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  otp: string;

  @ApiProperty({ description: '2FA前の仮トークン', example: 'temp_xxxx' })
  @IsString()
  tempToken: string;
}

export class Setup2faDto {
  @ApiProperty({ enum: ['EMAIL', 'SMS'] })
  @IsString()
  method: 'EMAIL' | 'SMS';

  @ApiProperty({ example: 'player1@example.com', description: 'Email or phone number' })
  @IsString()
  contact: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
