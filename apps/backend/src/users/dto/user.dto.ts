import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsIn,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RegisterDto } from '../../auth/dto/register.dto';
import {
  BackgroundStyle,
  DisplayTheme,
  MapStyle,
  MinoSkin,
  Role,
} from '@prisma/client';

export class KeyBindingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  left?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  right?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  moveLeft?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  moveRight?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  softDrop?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  hardDrop?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  rotateCW?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  rotateCCW?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  rotate180?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  hold?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  restart?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  quitToMenu?: string;
}

export class UpdateGameSettingsDto {
  @ApiPropertyOptional({ enum: MinoSkin })
  @IsOptional()
  @IsEnum(MinoSkin)
  minoSkin?: MinoSkin;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showGhost?: boolean;

  @ApiPropertyOptional({ enum: DisplayTheme })
  @IsOptional()
  @IsEnum(DisplayTheme)
  displayTheme?: DisplayTheme;

  @ApiPropertyOptional({ enum: MapStyle })
  @IsOptional()
  @IsEnum(MapStyle)
  mapStyle?: MapStyle;

  @ApiPropertyOptional({ enum: BackgroundStyle })
  @IsOptional()
  @IsEnum(BackgroundStyle)
  backgroundStyle?: BackgroundStyle;

  @ApiPropertyOptional({ minimum: 0, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  arr?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  das?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  dcd?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sdf?: number;

  @ApiPropertyOptional({ type: KeyBindingsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => KeyBindingsDto)
  keyBindings?: KeyBindingsDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  volume?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sfxEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  musicEnabled?: boolean;

  // This preference currently belongs to the frontend and is not persisted.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  touchFlick?: boolean;
}

export class ImportUserSettingsDto {
  @ApiProperty({ type: UpdateGameSettingsDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateGameSettingsDto)
  settings!: UpdateGameSettingsDto;
}

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
  @MaxLength(2048)
  avatarUrl?: string | null;
}

export class SearchUsersDto {
  @ApiPropertyOptional({ example: 'player' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    example: 'ONLINE',
    enum: ['ALL', 'ONLINE', 'OFFLINE'],
  })
  @IsOptional()
  @IsIn(['ALL', 'ONLINE', 'OFFLINE'])
  status?: 'ALL' | 'ONLINE' | 'OFFLINE';

  @ApiPropertyOptional({
    example: 'WIN_RATE_DESC',
    enum: ['RANK_POINTS_DESC', 'WIN_RATE_DESC', 'WIN_RATE_ASC', 'GAMES_DESC'],
  })
  @IsOptional()
  @IsIn(['RANK_POINTS_DESC', 'WIN_RATE_DESC', 'WIN_RATE_ASC', 'GAMES_DESC'])
  sortBy?: 'RANK_POINTS_DESC' | 'WIN_RATE_DESC' | 'WIN_RATE_ASC' | 'GAMES_DESC';
}

export class AdminCreateUserDto extends RegisterDto {}
export class AdminDeleteUserDto {
  @ApiProperty({ example: 'DELETE USER' })
  @IsIn(['DELETE USER'])
  confirmation!: 'DELETE USER';
}
export class AdminEditUserDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 50 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  bio?: string;
}

export class BanUserDto {
  @ApiProperty({ example: '不正行為のため' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'reason must contain a non-whitespace character' })
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    example: 7,
    minimum: 1,
    maximum: 3650,
    description: 'BAN期間（日数）。未指定の場合は永久BAN',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @ApiPropertyOptional({
    example: '2027-08-30T00:00:00Z',
    description: 'BAN解除日時。durationDaysとの同時指定は不可',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  bannedUntil?: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;
}

export class AdminUsersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class SearchHistoryDto {
  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Inclusive UTC date (YYYY-MM-DD).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-24',
    description: 'Inclusive UTC date (YYYY-MM-DD).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    example: 'ALL',
    enum: ['ALL', 'VERSUS', 'AI', 'TOURNAMENT', 'LINES_40', 'MARATHON'],
  })
  @IsOptional()
  @IsIn(['ALL', 'VERSUS', 'AI', 'TOURNAMENT', 'LINES_40', 'MARATHON'])
  mode?: 'ALL' | 'VERSUS' | 'AI' | 'TOURNAMENT' | 'LINES_40' | 'MARATHON';

  @ApiPropertyOptional({ example: 'ALL', enum: ['ALL', 'WIN', 'LOSE'] })
  @IsOptional()
  @IsIn(['ALL', 'WIN', 'LOSE'])
  result?: 'ALL' | 'WIN' | 'LOSE';
}

export class FriendRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  addresseeId?: string;

  @ApiPropertyOptional({ example: '@player' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(21)
  username?: string;
}

export class RespondFriendRequestDto {
  @ApiProperty()
  @IsBoolean()
  accept!: boolean;
}

export class DeleteOwnAccountDto {
  @ApiPropertyOptional({
    description: 'Password accounts must provide their current password',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  password?: string;

  @ApiPropertyOptional({
    description: 'Required when two-factor authentication is enabled',
  })
  @IsOptional()
  @Matches(/^\d{6}$/)
  twoFactorCode?: string;

  @ApiProperty({ example: 'DELETE MY ACCOUNT' })
  @IsIn(['DELETE MY ACCOUNT'])
  confirmation!: 'DELETE MY ACCOUNT';
}
