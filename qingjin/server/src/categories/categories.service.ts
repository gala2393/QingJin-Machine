import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { diffFields, diffKeyed } from '../common/diff';
import { blankToNull } from '../common/patterns';
import type { Category } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, PutTemplatesDto, UpdateCategoryDto } from './categories.dto';

const FIELDS: (keyof Category)[] = ['slug', 'nameZh', 'nameEn', 'icon'];

const view = (c: Category, machineCount: number) => ({
  id: c.id,
  slug: c.slug,
  nameZh: c.nameZh,
  nameEn: c.nameEn,
  icon: c.icon,
  sort: c.sort,
  machineCount,
});

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.category.findMany({
      orderBy: { sort: 'asc' },
      include: { _count: { select: { machines: true } } },
    });
    return rows.map((c) => view(c, c._count.machines));
  }

  private async assertSlugFree(slug: string, exceptId?: string) {
    const hit = await this.prisma.category.findUnique({ where: { slug } });
    if (hit && hit.id !== exceptId) throw new ConflictException(`分类 slug "${slug}" 已被使用`);
  }

  private async get(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('分类不存在');
    return c;
  }

  async create(dto: CreateCategoryDto, userId: string) {
    await this.assertSlugFree(dto.slug);
    const last = await this.prisma.category.aggregate({ _max: { sort: true } });
    const c = await this.prisma.category.create({
      data: {
        slug: dto.slug,
        nameZh: dto.nameZh.trim(),
        nameEn: dto.nameEn.trim(),
        icon: blankToNull(dto.icon),
        sort: (last._max.sort ?? 0) + 10,
      },
    });
    await this.audit.log({ userId, action: 'create', entity: 'category', entityId: c.id, diff: { slug: c.slug } });
    return view(c, 0);
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    const before = await this.get(id);
    if (dto.slug && dto.slug !== before.slug) await this.assertSlugFree(dto.slug, id);
    const after = await this.prisma.category.update({
      where: { id },
      data: {
        slug: dto.slug,
        nameZh: dto.nameZh?.trim(),
        nameEn: dto.nameEn?.trim(),
        icon: dto.icon === undefined ? undefined : blankToNull(dto.icon),
      },
      include: { _count: { select: { machines: true } } },
    });
    const diff = diffFields(before, after, FIELDS);
    if (Object.keys(diff).length) {
      await this.audit.log({ userId, action: 'update', entity: 'category', entityId: id, diff: diff as object });
    }
    return view(after, after._count.machines);
  }

  async remove(id: string, userId: string) {
    const c = await this.get(id);
    const count = await this.prisma.machine.count({ where: { categoryId: id } });
    if (count) throw new ConflictException(`分类「${c.nameZh}」下还有 ${count} 台机型，请先移走或删除这些机型`);
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log({ userId, action: 'delete', entity: 'category', entityId: id, diff: { slug: c.slug, nameZh: c.nameZh } });
  }

  async reorder(ids: string[], userId: string) {
    const all = await this.prisma.category.findMany({ select: { id: true } });
    const known = new Set(all.map((c) => c.id));
    if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
      throw new BadRequestException('排序列表必须包含全部分类且不能重复');
    }
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.category.update({ where: { id }, data: { sort: (i + 1) * 10 } })),
    );
    await this.audit.log({ userId, action: 'reorder', entity: 'category', diff: { ids } });
  }

  async templates(categoryId: string) {
    await this.get(categoryId);
    return this.prisma.paramTemplate.findMany({
      where: { categoryId },
      orderBy: { sort: 'asc' },
      select: { id: true, key: true, labelZh: true, labelEn: true, sort: true },
    });
  }

  async putTemplates(categoryId: string, dto: PutTemplatesDto, userId: string) {
    const keys = dto.items.map((i) => i.key);
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) throw new BadRequestException(`参数键 "${dup}" 重复`);
    const before = await this.templates(categoryId);

    await this.prisma.$transaction([
      this.prisma.paramTemplate.deleteMany({ where: { categoryId } }),
      this.prisma.paramTemplate.createMany({
        data: dto.items.map((t, i) => ({
          categoryId,
          key: t.key,
          labelZh: t.labelZh.trim(),
          labelEn: t.labelEn.trim(),
          sort: (i + 1) * 10,
        })),
      }),
    ]);

    const strip = (t: { key: string; labelZh: string; labelEn: string }) => ({ key: t.key, labelZh: t.labelZh, labelEn: t.labelEn });
    const diff = diffKeyed(before.map(strip), dto.items.map(strip), (t) => t.key);
    if (diff) await this.audit.log({ userId, action: 'update_templates', entity: 'category', entityId: categoryId, diff });
    return this.templates(categoryId);
  }
}
