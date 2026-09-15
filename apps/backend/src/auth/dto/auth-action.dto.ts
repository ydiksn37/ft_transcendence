import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken?: string;
}

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class AuthenticateTwoFactorDto extends TwoFactorCodeDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  tempToken!: string;
}
