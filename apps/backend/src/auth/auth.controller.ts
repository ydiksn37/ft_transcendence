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
import { Verify2faDto, Setup2faDto, RefreshTokenDto } from './dto/twofa.dto';
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

    const frontendUrl = process.env.VITE_API_BASE_URL?.replace('/api', '') ?? 'http://localhost:5173';

    if ('requires2FA' in result && result.requires2FA) {
      return res.redirect(
        `${frontendUrl}/auth/2fa?tempToken=${result.tempToken}&method=${result.method}`,
      );
    }

    const tokens = result as { accessToken: string; refreshToken: string; userId: string };
    return res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  }

  // ── 2FA 検証 ─────────────────────────────────────────────
  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OTPコードを検証してJWTを発行' })
  verify2fa(@Body() dto: Verify2faDto) {
    return this.authService.verify2fa(dto.otp, dto.tempToken);
  }

  // ── 2FA セットアップ ──────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '2FA方式（EMAIL/SMS）を設定してOTPを送信' })
  setup2fa(@CurrentUser() user: any, @Body() dto: Setup2faDto) {
    return this.authService.setup2fa(user.id, dto);
  }

  // ── 2FA セットアップ確認 ──────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('2fa/confirm')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '2FAセットアップのOTPを確認して有効化' })
  confirmSetup2fa(
    @CurrentUser() user: any,
    @Body() body: { otp: string },
  ) {
    return this.authService.confirmSetup2fa(user.id, body.otp);
  }

  // ── 2FA 無効化 ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '2FAを無効化' })
  disable2fa(@CurrentUser() user: any, @Body() body: { otp: string }) {
    return this.authService.disable2fa(user.id, body.otp);
  }

  // ── OTP 再送 ──────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('2fa/resend')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'OTPコードを再送' })
  resendOtp(@CurrentUser() user: any) {
    return this.authService.resendOtp(user.id);
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
