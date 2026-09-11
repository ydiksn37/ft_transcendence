import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({
    example: 'ONLINE',
    enum: ['ALL', 'ONLINE', 'OFFLINE'],
  })
  @IsOptional()
  @IsString()
  status?: 'ALL' | 'ONLINE' | 'OFFLINE';

  @ApiPropertyOptional({
    example: 'WIN_RATE_DESC',
    enum: ['WIN_RATE_DESC', 'WIN_RATE_ASC', 'GAMES_DESC'],
  })
  @IsOptional()
  @IsString()
  sortBy?: 'WIN_RATE_DESC' | 'WIN_RATE_ASC' | 'GAMES_DESC';
}

export class BanUserDto {
  @ApiPropertyOptional({ example: '不正行為のため' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    example: '2026-08-30T00:00:00Z',
    description: '未指定は永久BAN',
  })
  @IsOptional()
  bannedUntil?: string;
}

export class SearchHistoryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 'ALL', enum: ['ALL', 'CLASSIC', 'MODERN'] })
  @IsOptional()
  @IsString()
  mode?: 'ALL' | 'CLASSIC' | 'MODERN';

  @ApiPropertyOptional({ example: 'ALL', enum: ['ALL', 'WIN', 'LOSE'] })
  @IsOptional()
  @IsString()
  result?: 'ALL' | 'WIN' | 'LOSE';
}
