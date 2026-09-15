import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RoleType } from './roles.decorator';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleType;
}

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/** リクエストからログイン中のユーザーを取得するデコレータ */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
