import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ConflictException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { Response } from 'express';
import { AuthService, OAUTH_EMAIL_CONFLICT } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  AuthenticateTwoFactorDto,
  LogoutDto,
  TwoFactorCodeDto,
} from './dto/auth-action.dto';
import { FtOauthGuard, JwtAuthGuard } from './guards/auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './decorators/current-user.decorator';

interface OAuthUserProfile {
  oauthId: string;
  oauthProvider: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  // ── 通常登録 ──────────────────────────────────────────────
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'メール＆パスワードで新規登録' })
  @ApiResponse({ status: 201, description: 'JWT発行成功' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ── ログイン ──────────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ログイン → JWT or 2FA仮トークン発行' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ── 42 OAuth 開始 ─────────────────────────────────────────
  @Public()
  @UseGuards(FtOauthGuard)
  @Get('42')
  @ApiOperation({ summary: '42 OAuth認証を開始（ブラウザリダイレクト）' })
  ftLogin() {
    // Passport が自動で 42 の認証ページへリダイレクト
  }

  // ── 42 OAuth コールバック ─────────────────────────────────
  @Public()
  @UseGuards(FtOauthGuard)
  @Get('42/callback')
  @ApiOperation({ summary: '42 OAuthコールバック' })
  async ftCallback(@Req() req: Request, @Res() res: Response) {
    const oauthUser = req.user as OAuthUserProfile;
    let result;
    try {
      result = await this.authService.loginOrRegisterOauth(oauthUser);
    } catch (e) {
      if (
        e instanceof ConflictException &&
        e.message === OAUTH_EMAIL_CONFLICT
      ) {
        return res.redirect(`/auth/callback?error=${OAUTH_EMAIL_CONFLICT}`);
      }
      this.logger.error('Error in loginOrRegisterOauth', e);
      throw e;
    }

    const tokens = result;

    let redirectUrl = '';
    if ('require2FA' in tokens && tokens.require2FA) {
      redirectUrl = `/auth/callback?require2FA=true&tempToken=${tokens.tempToken}&userId=${tokens.userId}`;
    } else if ('accessToken' in tokens) {
      redirectUrl = `/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`;
    }

    if (req.query.state && typeof req.query.state === 'string') {
      redirectUrl += `&redirectTo=${encodeURIComponent(req.query.state)}`;
    }

    return res.redirect(redirectUrl);
  }

  // ── Refresh Token ─────────────────────────────────────────
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refreshトークンでアクセストークンを更新' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  // ── ログアウト ────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'ログアウト（Refreshトークンを無効化）' })
  logout(@CurrentUser() user: AuthenticatedUser, @Body() body: LogoutDto) {
    return this.authService.logout(user.id, body.refreshToken);
  }

  // ── 2FA ──────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('2fa/generate')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '2FAのQRコード生成' })
  generate2FA(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.generateTwoFactorAuthSecret(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/turn-on')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '2FAを有効化する' })
  turnOn2FA(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TwoFactorCodeDto,
  ) {
    return this.authService.turnOnTwoFactorAuth(user.id, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/turn-off')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '2FAを無効化する' })
  turnOff2FA(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TwoFactorCodeDto,
  ) {
    return this.authService.turnOffTwoFactorAuth(user.id, body.code);
  }

  @Public()
  @Post('2fa/authenticate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ログイン時の2FAコード検証' })
  authenticate2FA(@Body() body: AuthenticateTwoFactorDto) {
    return this.authService.authenticate2FA(
      body.userId,
      body.code,
      body.tempToken,
    );
  }
}
