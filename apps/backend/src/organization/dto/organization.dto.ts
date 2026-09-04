import { IsString, IsOptional, IsBoolean, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'My Awesome Clan' })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'my-awesome-clan' })
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug can only contain lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @ApiProperty({ required: false, example: 'We are the best clan' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateOrganizationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class InviteMemberDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsString()
  userId: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] })
  @IsString()
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
