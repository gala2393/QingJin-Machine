import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { diffFields } from '../common/diff';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const SELECT = { id: true, username: true, displayName: true, role: true, active: true, lastLoginAt: true, createdAt: true } satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({ select: SELECT, orderBy: { createdAt: 'asc' } });
  }

  private async find(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: SELECT });
    if (!u) throw new NotFoundException('用户不存在');
    return u;
  }

  /** Every change that could remove admin access goes through this, so the system can't lock itself out. */
  private async assertAnotherSuperAdmin(exceptId: string) {
    const others = await this.prisma.user.count({ where: { role: 'SUPER_ADMIN', active: true, id: { not: exceptId } } });
    if (!others) throw new BadRequestException('至少需要保留一个启用的超级管理员');
  }

  private revokeSessions(userId: string) {
    return this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async create(dto: CreateUserDto, actorId: string) {
    const username = dto.username.trim();
    if (await this.prisma.user.findUnique({ where: { username } })) throw new ConflictException('用户名已存在');
    const user = await this.prisma.user.create({
      data: { username, displayName: dto.displayName.trim(), role: dto.role, passwordHash: await bcrypt.hash(dto.password, 10) },
      select: SELECT,
    });
    await this.audit.log({ userId: actorId, action: 'create', entity: 'user', entityId: user.id, diff: { username, role: dto.role } });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const before = await this.find(id);
    if (id === actorId && ((dto.role && dto.role !== before.role) || dto.active === false)) {
      throw new BadRequestException('不能修改自己的角色或停用自己');
    }
    const losesAdmin = before.role === 'SUPER_ADMIN' && before.active && ((dto.role && dto.role !== 'SUPER_ADMIN') || dto.active === false);
    if (losesAdmin) await this.assertAnotherSuperAdmin(id);

    const after = await this.prisma.user.update({
      where: { id },
      data: { displayName: dto.displayName?.trim(), role: dto.role, active: dto.active },
      select: SELECT,
    });
    const diff = diffFields(before, after, ['displayName', 'role', 'active']);
    if (Object.keys(diff).length) {
      // A refresh would re-issue the old role, and a disabled user must not get new tokens.
      if (diff.role || diff.active) await this.revokeSessions(id);
      await this.audit.log({ userId: actorId, action: 'update', entity: 'user', entityId: id, diff: { username: before.username, ...diff } as Prisma.InputJsonValue });
    }
    return after;
  }

  async resetPassword(id: string, password: string, actorId: string) {
    const u = await this.find(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
      this.revokeSessions(id),
    ]);
    await this.audit.log({ userId: actorId, action: 'password_reset', entity: 'user', entityId: id, diff: { username: u.username } });
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('不能删除自己');
    const u = await this.find(id);
    if (u.role === 'SUPER_ADMIN' && u.active) await this.assertAnotherSuperAdmin(id);
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log({ userId: actorId, action: 'delete', entity: 'user', entityId: id, diff: { username: u.username, role: u.role } });
  }
}
