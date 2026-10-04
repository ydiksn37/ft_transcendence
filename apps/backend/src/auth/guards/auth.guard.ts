import {
  Injectable,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

export const IS_PUBLIC_KEY = 'isPublic';

/** JWT 認証ガード — @Public() デコレータが付いたルートはスキップ */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException(info?.message ?? 'Unauthorized');
    }
    return user;
  }
}

/** 42 OAuth ガード */
@Injectable()
export class FtOauthGuard extends AuthGuard('42') {
  private readonly logger = new Logger(FtOauthGuard.name);

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    return {
      state: req.query.state,
    };
  }

  handleRequest(err: any, user: any, info: any) {
    if (err) {
      this.logger.error('FtOauthGuard error', err);
    }
    if (info) {
      this.logger.warn('FtOauthGuard authentication info', info);
    }
    if (err || !user) {
      this.logger.warn('FtOauthGuard rejected authentication');
      throw err || new UnauthorizedException('42 Authentication Failed');
    }
    return user;
  }
}
