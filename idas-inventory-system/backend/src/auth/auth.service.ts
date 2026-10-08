import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ROLE_PERMISSIONS } from '../common/permissions';
import { ReqMeta } from '../common/decorators';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private cfg: ConfigService, private audit: AuditService) {}

  get refreshDays() { return parseInt(this.cfg.get('JWT_REFRESH_EXPIRES_DAYS') ?? '7', 10); }

  private async issue(user: { id: string; email: string; role: { name: string } }, meta?: ReqMeta) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role.name },
      { secret: this.cfg.getOrThrow('JWT_SECRET'), expiresIn: this.cfg.get('JWT_EXPIRES_IN') ?? '15m' },
    );
    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id, tokenHash: sha(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshDays * 86400_000),
        ip: meta?.ip, userAgent: meta?.userAgent?.slice(0, 250),
      },
    });
    return { accessToken, refreshToken };
  }

  profile(user: any) {
    return {
      id: user.id, email: user.email, fullName: user.fullName, universityId: user.universityId,
      phone: user.phone, role: user.role.name, roleLabel: user.role.label,
      department: user.department?.name ?? null,
      permissions: ROLE_PERMISSIONS[user.role.name as keyof typeof ROLE_PERMISSIONS] ?? [],
    };
  }

  async login(email: string, password: string, meta?: ReqMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }, include: { role: true, department: true },
    });
    const fail = async (reason: string) => {
      await this.audit.log(null, { userId: user?.id, action: 'Login failed', module: 'auth', recordId: user?.id, next: { email, reason }, meta });
      throw new UnauthorizedException('Invalid email or password');
    };
    if (!user) return fail('unknown user');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new ForbiddenException('Account temporarily locked. Try again later.');
    if (!user.isActive) throw new ForbiddenException('This account has been deactivated');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const fails = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      return fail('bad password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    const tokens = await this.issue(user, meta);
    await this.audit.log(null, { userId: user.id, action: 'Login', module: 'auth', recordId: user.id, meta });
    return { ...tokens, user: this.profile(user) };
  }

  /** Refresh-token rotation: old token is revoked, a new pair is issued. Reuse of a revoked token revokes the whole family. */
  async refresh(token: string | undefined, meta?: ReqMeta) {
    if (!token) throw new UnauthorizedException('No refresh token');
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(token) }, include: { user: { include: { role: true, department: true } } } });
    if (!row) throw new UnauthorizedException('Invalid refresh token');
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Refresh token reuse detected; please sign in again');
    }
    if (row.expiresAt < new Date() || !row.user.isActive) throw new UnauthorizedException('Session expired');
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    const tokens = await this.issue(row.user, meta);
    return { ...tokens, user: this.profile(row.user) };
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async changePassword(userId: string, current: string, next: string, meta?: ReqMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new BadRequestException('Current password is incorrect');
    if (current === next) throw new BadRequestException('New password must differ from the current one');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 12) } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, { userId, action: 'Password changed', module: 'auth', recordId: userId, meta });
    });
    return { ok: true };
  }
}
