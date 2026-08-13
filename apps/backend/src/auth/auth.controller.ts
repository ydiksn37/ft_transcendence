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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { FtOauthGuard, JwtAuthGuard } from './guards/auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
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
    const oauthUser = req.user as any;
    const result = await this.authService.loginOrRegisterOauth(oauthUser);

    const tokens = result as { accessToken: string; refreshToken: string; userId: string };
    
    let redirectUrl = `/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`;
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
  logout(@CurrentUser() user: any, @Body() body: { refreshToken?: string }) {
    return this.authService.logout(user.id, body.refreshToken);
  }
}
