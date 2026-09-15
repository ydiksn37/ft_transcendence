import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GameMode, Rank, TournamentStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class LeaderboardQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Rank })
  @IsOptional()
  @IsEnum(Rank)
  rank?: Rank;
}

export class UserHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GameMode })
  @IsOptional()
  @IsEnum(GameMode)
  mode?: GameMode;
}

export class TournamentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TournamentStatus })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;
}

export class UsernameParamDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  username!: string;
}

export class ApiKeyIdParamDto {
  @ApiProperty()
  @IsUUID()
  id!: string;
}

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: 'label must contain a non-whitespace character' })
  label!: string;

  @ApiPropertyOptional({ default: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}
