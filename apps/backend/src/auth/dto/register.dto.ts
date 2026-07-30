import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'player1@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'player_one' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  username: string;

  @ApiProperty({ example: 'Player One' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;
}
