import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** Content writes: everyone except VIEWER. */
export const Editor = () => Roles('SUPER_ADMIN', 'EDITOR');

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  family?: string;
}

export type AuthedRequest = Request & { user?: AuthUser };

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser | undefined => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
