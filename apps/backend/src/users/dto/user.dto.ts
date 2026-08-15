import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'New Display Name' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({ example: 'テトリス大好きです！' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  bio?: string;

  @ApiPropertyOptional({ example: 'preset:2' })
  @IsString()
  @IsOptional()
  avatarUrl?: string | null;
}

export class SearchUsersDto {
  @ApiPropertyOptional({ example: 'player' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}

export class BanUserDto {
  @ApiPropertyOptional({ example: '不正行為のため' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ example: '2026-08-30T00:00:00Z', description: '未指定は永久BAN' })
  @IsOptional()
  bannedUntil?: string;
}
