import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../auth/decorators';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays } from '../stats/track';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TZ_OFFSET = '+08:00';

class ListAuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsOptional() @IsString() @MaxLength(64) entity?: string;
  @IsOptional() @IsString() @MaxLength(64) action?: string;
  @IsOptional() @Matches(DAY, { message: '日期格式应为 YYYY-MM-DD' }) from?: string;
  @IsOptional() @Matches(DAY, { message: '日期格式应为 YYYY-MM-DD' }) to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

@Roles('SUPER_ADMIN')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() q: ListAuditQuery) {
    const where: Prisma.AuditLogWhereInput = {};
    if (q.userId) where.userId = q.userId;
    if (q.entity) where.entity = q.entity;
    if (q.action) where.action = q.action;
    if (q.from || q.to) {
      // Days are business days (China time), matching what the admin shows.
      if (q.from && q.to && q.from > q.to) throw new BadRequestException('开始日期不能晚于结束日期');
      where.createdAt = {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00${TZ_OFFSET}`) } : {}),
        ...(q.to ? { lt: new Date(`${addDays(q.to, 1)}T00:00:00${TZ_OFFSET}`) } : {}),
      };
    }
    const term = q.q?.trim();
    if (term) {
      where.OR = [
        { entityId: { contains: term } },
        { user: { username: { contains: term, mode: 'insensitive' } } },
        { user: { displayName: { contains: term, mode: 'insensitive' } } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { id: true, username: true, displayName: true } } },
      }),
    ]);
    return {
      total,
      items: items.map((a) => ({ id: a.id, createdAt: a.createdAt, user: a.user, action: a.action, entity: a.entity, entityId: a.entityId, diff: a.diff, ip: a.ip })),
    };
  }

  @Get('facets')
  async facets() {
    const [entities, actions, users] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      this.prisma.user.findMany({ select: { id: true, username: true, displayName: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action), users };
  }
}
