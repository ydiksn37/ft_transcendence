import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
} from './dto/organization.dto';

@ApiTags('Organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  @ApiOperation({ summary: '組織（クラン）を作成' })
  createOrganization(
    @CurrentUser() user: any,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.orgService.createOrganization(user.id, dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: '公開組織の一覧取得' })
  getOrganizations(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.orgService.getOrganizations(page, limit);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: '組織の詳細取得（Slug）' })
  getOrganizationBySlug(@Param('slug') slug: string) {
    return this.orgService.getOrganizationBySlug(slug);
  }

  @Patch(':id')
  @ApiOperation({ summary: '組織情報の更新（OWNER/ADMINのみ）' })
  updateOrganization(
    @CurrentUser() user: any,
    @Param('id') orgId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgService.updateOrganization(user.id, orgId, dto);
  }

  @Post(':id/join')
  @ApiOperation({ summary: '公開組織に参加する' })
  joinOrganization(@CurrentUser() user: any, @Param('id') orgId: string) {
    return this.orgService.joinOrganization(user.id, orgId);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: '組織から脱退する' })
  leaveOrganization(@CurrentUser() user: any, @Param('id') orgId: string) {
    return this.orgService.leaveOrganization(user.id, orgId);
  }

  @Post(':id/invite')
  @ApiOperation({ summary: 'ユーザーを組織に招待する（OWNER/ADMINのみ）' })
  inviteMember(
    @CurrentUser() user: any,
    @Param('id') orgId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.orgService.inviteMember(user.id, orgId, dto.userId);
  }

  @Patch(':id/members/:userId/role')
  @ApiOperation({ summary: 'メンバーの権限を変更する（OWNER/ADMINのみ）' })
  updateMemberRole(
    @CurrentUser() user: any,
    @Param('id') orgId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.orgService.updateMemberRole(user.id, orgId, targetUserId, dto.role as any);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'メンバーを組織から追放する（OWNER/ADMINのみ）' })
  removeMember(
    @CurrentUser() user: any,
    @Param('id') orgId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.orgService.removeMember(user.id, orgId, targetUserId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '組織を削除する（OWNERのみ）' })
  deleteOrganization(@CurrentUser() user: any, @Param('id') orgId: string) {
    return this.orgService.deleteOrganization(user.id, orgId);
  }
}
