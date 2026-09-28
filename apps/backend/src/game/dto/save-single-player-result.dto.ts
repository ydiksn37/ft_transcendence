import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OtherSpinCountsDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000000) I?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) J?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) L?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) S?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) Z?: number;
}

export class SaveSinglePlayerResultDto {
  @ApiPropertyOptional({ type: OtherSpinCountsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OtherSpinCountsDto)
  otherSpins?: OtherSpinCountsDto;
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
