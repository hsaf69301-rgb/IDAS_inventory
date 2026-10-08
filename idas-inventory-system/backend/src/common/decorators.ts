import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PermissionCode } from './permissions';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMS_KEY = 'perms';
/** Require ALL listed permissions. Enforced server-side by PermissionsGuard. */
export const RequirePermissions = (...p: PermissionCode[]) => SetMetadata(PERMS_KEY, p);

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
}
export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export interface ReqMeta { ip?: string; userAgent?: string }
export const Meta = createParamDecorator((_d, ctx: ExecutionContext): ReqMeta => {
  const r = ctx.switchToHttp().getRequest();
  return { ip: r.ip, userAgent: r.headers['user-agent'] };
});
