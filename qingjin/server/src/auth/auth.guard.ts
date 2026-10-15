import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedRequest, AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

export const ACCESS_AUDIENCE = 'admin-api';

export interface AccessPayload {
  sub: string;
  username: string;
  role: Role;
  /** Refresh-token family of the session, so "log out other sessions" can spare the current one. */
  fam?: string;
}

/** Global guard: every route needs a valid access token unless marked @Public(); @Roles() narrows further. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('未登录');

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, { audience: ACCESS_AUDIENCE });
    } catch {
      throw new UnauthorizedException('登录已过期');
    }
    if (!payload.sub || !payload.role) throw new UnauthorizedException('登录已过期');
    // Look the account up on every request so disabling a user or changing a role applies at once,
    // not when their 15-minute access token runs out (one primary-key read; admin traffic is light).
    const account = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { username: true, role: true, active: true } });
    if (!account?.active) throw new UnauthorizedException('账号不可用');
    const user: AuthUser = { id: payload.sub, username: account.username, role: account.role, family: payload.fam };
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('没有权限执行此操作');
    return true;
  }
}
