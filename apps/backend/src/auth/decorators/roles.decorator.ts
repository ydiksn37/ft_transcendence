import { SetMetadata } from '@nestjs/common';

export type RoleType = 'ADMIN' | 'MODERATOR' | 'USER' | 'GUEST';

export const ROLES_KEY = 'roles';

/** 許可するロールを指定するデコレータ */
export const Roles = (...roles: RoleType[]) => SetMetadata(ROLES_KEY, roles);
