import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthUser, CurrentUser, Meta, Public, ReqMeta } from '../common/decorators';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { PrismaService } from '../prisma/prisma.service';

const COOKIE = 'idas_rt';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private prisma: PrismaService) {}

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true',
      path: '/api/auth', maxAge: this.auth.refreshDays * 86400_000,
    });
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response, @Meta() meta: ReqMeta) {
    const r = await this.auth.login(dto.email, dto.password, meta);
    this.setCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Meta() meta: ReqMeta) {
    const r = await this.auth.refresh(req.cookies?.[COOKIE], meta);
    this.setCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public() @Post('logout') @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/api/auth' });
    return { ok: true };
  }

  @ApiBearerAuth() @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { role: true, department: true } });
    return this.auth.profile(user);
  }

  @ApiBearerAuth() @Post('change-password') @HttpCode(200)
  change(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto, @Meta() meta: ReqMeta) {
    return this.auth.changePassword(u.id, dto.current, dto.next, meta);
  }
}
