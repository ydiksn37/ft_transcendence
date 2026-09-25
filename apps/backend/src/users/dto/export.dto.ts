import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format: 'json' | 'csv' = 'json';
}

export class ArchiveImportDto {
  @IsIn(['json', 'csv'])
  format!: 'json' | 'csv';

  @IsString()
  @MaxLength(1_000_000)
  data!: string;
}
