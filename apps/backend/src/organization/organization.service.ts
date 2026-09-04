import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { OrgRole } from '@prisma/client';

@Injectable()
export class OrganizationService {
  constructor(private prisma: PrismaService) {}

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    const existing = await this.prisma.organization.findFirst({
      where: { OR: [{ name: dto.name }, { slug: dto.slug }] },
    });
    if (existing) {
      throw new ConflictException('Organization name or slug already exists');
    }

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          isPublic: dto.isPublic ?? true,
          creatorId: userId,
        },
      });

      await tx.orgMembership.create({
        data: {
          orgId: org.id,
          userId,
          role: OrgRole.OWNER,
        },
      });

      return org;
    });
  }

  async getOrganizations(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.organization.findMany({
        where: { isPublic: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.organization.count({ where: { isPublic: true } }),
    ]);

    return { data, total, page, limit };
  }

  async getOrganizationBySlug(slug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateOrganization(userId: string, orgId: string, dto: UpdateOrganizationDto) {
    await this.checkRole(userId, orgId, [OrgRole.OWNER, OrgRole.ADMIN]);
    
    return this.prisma.organization.update({
      where: { id: orgId },
      data: dto,
    });
  }

  async joinOrganization(userId: string, orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    if (!org.isPublic) throw new ForbiddenException('Organization is private. You must be invited.');

    const membership = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });

    if (membership) throw new ConflictException('You are already a member');

    const count = await this.prisma.orgMembership.count({ where: { orgId } });
    if (count >= org.maxMembers) throw new ConflictException('Organization is full');

    return this.prisma.orgMembership.create({
      data: {
        orgId,
        userId,
        role: OrgRole.MEMBER,
      },
    });
  }

  async leaveOrganization(userId: string, orgId: string) {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });

    if (!membership) throw new NotFoundException('You are not a member');
    if (membership.role === OrgRole.OWNER) {
      throw new ForbiddenException('Owner cannot leave. Transfer ownership first or delete organization.');
    }

    return this.prisma.orgMembership.delete({
      where: { id: membership.id },
    });
  }

  async inviteMember(inviterId: string, orgId: string, targetUserId: string) {
    await this.checkRole(inviterId, orgId, [OrgRole.OWNER, OrgRole.ADMIN]);

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const membership = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId: targetUserId } },
    });
    if (membership) throw new ConflictException('User is already a member');

    const count = await this.prisma.orgMembership.count({ where: { orgId } });
    if (count >= org.maxMembers) throw new ConflictException('Organization is full');

    return this.prisma.orgMembership.create({
      data: {
        orgId,
        userId: targetUserId,
        role: OrgRole.MEMBER,
        invitedBy: inviterId,
      },
    });
  }

  async updateMemberRole(adminId: string, orgId: string, targetUserId: string, newRole: OrgRole) {
    const adminMembership = await this.checkRole(adminId, orgId, [OrgRole.OWNER, OrgRole.ADMIN]);
    
    if (newRole === OrgRole.OWNER && adminMembership.role !== OrgRole.OWNER) {
      throw new ForbiddenException('Only owner can make another user an owner');
    }

    const targetMembership = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId: targetUserId } },
    });

    if (!targetMembership) throw new NotFoundException('Target user is not a member');

    return this.prisma.orgMembership.update({
      where: { id: targetMembership.id },
      data: { role: newRole },
    });
  }

  async removeMember(adminId: string, orgId: string, targetUserId: string) {
    await this.checkRole(adminId, orgId, [OrgRole.OWNER, OrgRole.ADMIN]);
    
    const targetMembership = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId: targetUserId } },
    });

    if (!targetMembership) throw new NotFoundException('Target user is not a member');
    if (targetMembership.role === OrgRole.OWNER) {
      throw new ForbiddenException('Cannot remove the owner');
    }

    return this.prisma.orgMembership.delete({
      where: { id: targetMembership.id },
    });
  }

  async deleteOrganization(userId: string, orgId: string) {
    await this.checkRole(userId, orgId, [OrgRole.OWNER]);

    return this.prisma.organization.delete({
      where: { id: orgId },
    });
  }

  private async checkRole(userId: string, orgId: string, allowedRoles: OrgRole[]) {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });

    if (!membership || !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient permissions in this organization');
    }

    return membership;
  }
}
