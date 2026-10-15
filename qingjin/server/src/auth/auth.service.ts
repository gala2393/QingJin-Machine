import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessPayload } from './auth.guard';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: User['role'];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

// Compared against when the username doesn't exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
});

@Injectable()
export class AuthService {
  private readonly refreshDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.refreshDays = Number(config.get('JWT_REFRESH_TTL_DAYS') ?? 7);
  }

  async login(username: string, password: string, ip?: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.active) {
      await this.audit.log({ userId: user?.id, action: 'login_failed', entity: 'auth', diff: { username }, ip });
      throw new UnauthorizedException('用户名或密码错误');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ userId: user.id, action: 'login', entity: 'auth', ip });
    return this.issue(user, randomUUID());
  }

  /** Rotates the refresh token. Presenting an already-rotated token revokes the whole family (likely theft). */
  async refresh(rawToken: string, ip?: string): Promise<TokenPair> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException('登录已失效，请重新登录');

    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { family: record.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({ userId: record.userId, action: 'refresh_token_reuse', entity: 'auth', ip });
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    if (record.expiresAt < new Date() || !record.user.active) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }

    // Conditional update so two concurrent refreshes with the same token can't both succeed.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException('登录已失效，请重新登录');
    return this.issue(record.user, record.family);
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException('账号不可用');
    return toPublicUser(user);
  }

  /** Changes the caller's own password and signs out every other session (the current family survives). */
  async changePassword(userId: string, family: string | undefined, current: string, next: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(current, user.passwordHash))) throw new BadRequestException('当前密码不正确');
    if (current === next) throw new BadRequestException('新密码不能与当前密码相同');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 10) } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null, ...(family ? { family: { not: family } } : {}) },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log({ userId, action: 'password_change', entity: 'user', entityId: userId });
  }

  private async issue(user: User, family: string): Promise<TokenPair> {
    const payload: AccessPayload = { sub: user.id, username: user.username, role: user.role, fam: family };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        family,
        expiresAt: new Date(Date.now() + this.refreshDays * 86_400_000),
      },
    });
    return { accessToken, refreshToken, user: toPublicUser(user) };
  }
}
