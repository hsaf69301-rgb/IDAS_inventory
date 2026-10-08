import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_PERMISSIONS } from '../common/permissions';
import { AuthUser } from '../common/decorators';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cfg: ConfigService, private prisma: PrismaService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: cfg.getOrThrow('JWT_SECRET'), ignoreExpiration: false });
  }
  async validate(payload: { sub: string }): Promise<AuthUser> {
    const u = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
    if (!u || !u.isActive) throw new UnauthorizedException();
    return { id: u.id, email: u.email, fullName: u.fullName, role: u.role.name, permissions: ROLE_PERMISSIONS[u.role.name] ?? [] };
  }
}
