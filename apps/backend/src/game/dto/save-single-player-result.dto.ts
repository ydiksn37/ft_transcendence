import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SaveSinglePlayerResultDto {
  @ApiProperty({ enum: ['40_LINES', 'MARATHON'] })
  @IsIn(['40_LINES', 'MARATHON'])
  gameMode!: '40_LINES' | 'MARATHON';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(100000)
  apm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1000)
  pps?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1000000)
  linesCleared!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  tSpins?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  tetrises?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(864000)
  durationSeconds!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  score?: number;
}
