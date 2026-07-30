import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** リクエストからログイン中のユーザーを取得するデコレータ */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
