import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTournamentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: [4, 8, 16] })
  @IsInt()
  @IsIn([4, 8, 16])
  maxPlayers!: 4 | 8 | 16;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  registrationDeadline?: string;
}

export class TournamentListQueryDto {
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
