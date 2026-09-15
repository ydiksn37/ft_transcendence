import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveSprintDto {
  @ApiProperty({ description: 'クリアタイム (ミリ秒)' })
  @IsInt()
  @Min(1)
  @Max(86400000)
  timeMs: number;

  @ApiProperty({ description: 'クリアしたライン数 (通常は40)', default: 40 })
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  lines?: number;

  @ApiProperty({ description: '配置したミノの数 (PPS計算用)', required: false })
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  pieces?: number;
}
