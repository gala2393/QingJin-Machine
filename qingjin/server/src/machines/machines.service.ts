import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { diffFields, diffKeyed } from '../common/diff';
import { compactModel, mediaUrl } from '../common/media-url';
import { blankToNull } from '../common/patterns';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BatchAction, ListMachinesQuery, MachineInputDto } from './machines.dto';

type Tx = Prisma.TransactionClient;

const DETAIL_INCLUDE = {
  category: { select: { id: true, slug: true, nameZh: true, nameEn: true } },
  params: { orderBy: { sort: 'asc' } },
  images: { orderBy: { sort: 'asc' }, include: { media: true } },
} satisfies Prisma.MachineInclude;

type MachineWithDetail = Prisma.MachineGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const SCALAR_FIELDS = [
  'slug', 'model', 'categoryId', 'nameZh', 'nameEn', 'summaryZh', 'summaryEn', 'status', 'featured',
  'seoTitleZh', 'seoTitleEn', 'seoDescZh', 'seoDescEn', 'notes',
] as const;

function toDetail(m: MachineWithDetail) {
  return {
    id: m.id,
    slug: m.slug,
    model: m.model,
    categoryId: m.categoryId,
    category: m.category,
    nameZh: m.nameZh,
    nameEn: m.nameEn,
    summaryZh: m.summaryZh,
    summaryEn: m.summaryEn,
    status: m.status,
    featured: m.featured,
    sort: m.sort,
    seoTitleZh: m.seoTitleZh,
    seoTitleEn: m.seoTitleEn,
    seoDescZh: m.seoDescZh,
    seoDescEn: m.seoDescEn,
    notes: m.notes,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    params: m.params.map((p) => ({ key: p.key, labelZh: p.labelZh, labelEn: p.labelEn, valueZh: p.valueZh, valueEn: p.valueEn })),
    images: m.images.map((i) => ({
      mediaId: i.mediaId,
      url: mediaUrl(i.media.path),
      width: i.media.width,
      height: i.media.height,
      isCover: i.isCover,
    })),
  };
}

export type MachineDetail = ReturnType<typeof toDetail>;

/** Comparable snapshot used for audit diffs. */
const snapshot = (d: MachineDetail) => ({
  scalars: Object.fromEntries(SCALAR_FIELDS.map((f) => [f, d[f]])) as Record<(typeof SCALAR_FIELDS)[number], unknown>,
  params: d.params,
  images: d.images.map((i) => ({ mediaId: i.mediaId, isCover: i.isCover })),
});

@Injectable()
export class MachinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListMachinesQuery) {
    const where: Prisma.MachineWhereInput = {};
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.status) where.status = q.status;
    if (q.featured !== undefined) where.featured = q.featured;
    const term = q.q?.trim();
    if (term) {
      const key = compactModel(term);
      where.OR = [
        { model: { contains: term, mode: 'insensitive' } },
        ...(key ? [{ modelKey: { contains: key } }] : []),
        { nameZh: { contains: term, mode: 'insensitive' } },
        { nameEn: { contains: term, mode: 'insensitive' } },
      ];
    }

    const include = {
      category: { select: { id: true, slug: true, nameZh: true } },
      images: { where: { isCover: true }, take: 1, include: { media: { select: { path: true } } } },
      _count: { select: { params: true } },
    } satisfies Prisma.MachineInclude;
    const siteOrder: Prisma.MachineOrderByWithRelationInput[] = [{ category: { sort: 'asc' } }, { sort: 'asc' }, { createdAt: 'asc' }];
    const skip = (q.page - 1) * q.pageSize;

    let total: number;
    let rows: Prisma.MachineGetPayload<{ include: typeof include }>[];
    if (q.order === 'pending' && !q.status) {
      // The enum's declared order (DRAFT, PUBLISHED, HIDDEN) can't express "not published first", so page
      // across two queries: unpublished machines, then published ones in site order.
      const pendingWhere: Prisma.MachineWhereInput = { AND: [where, { status: { not: 'PUBLISHED' } }] };
      const liveWhere: Prisma.MachineWhereInput = { AND: [where, { status: 'PUBLISHED' }] };
      const [pendingCount, liveCount] = await this.prisma.$transaction([
        this.prisma.machine.count({ where: pendingWhere }),
        this.prisma.machine.count({ where: liveWhere }),
      ]);
      total = pendingCount + liveCount;
      const pendingTake = Math.max(0, Math.min(q.pageSize, pendingCount - skip));
      const [pendingRows, liveRows] = await this.prisma.$transaction([
        this.prisma.machine.findMany({ where: pendingWhere, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip, take: pendingTake, include }),
        this.prisma.machine.findMany({
          where: liveWhere,
          orderBy: siteOrder,
          skip: Math.max(0, skip - pendingCount),
          take: q.pageSize - pendingTake,
          include,
        }),
      ]);
      rows = [...pendingRows, ...liveRows];
    } else {
      [total, rows] = await this.prisma.$transaction([
        this.prisma.machine.count({ where }),
        this.prisma.machine.findMany({ where, orderBy: siteOrder, skip, take: q.pageSize, include }),
      ]);
    }

    return {
      total,
      items: rows.map((m) => ({
        id: m.id,
        slug: m.slug,
        model: m.model,
        nameZh: m.nameZh,
        nameEn: m.nameEn,
        status: m.status,
        featured: m.featured,
        sort: m.sort,
        category: m.category,
        coverUrl: m.images[0] ? mediaUrl(m.images[0].media.path) : null,
        paramCount: m._count.params,
        updatedAt: m.updatedAt,
      })),
    };
  }

  async slugAvailable(slug: string, excludeId?: string) {
    const hit = await this.prisma.machine.findUnique({ where: { slug }, select: { id: true } });
    return { available: !hit || hit.id === excludeId };
  }

  async get(id: string, db: Tx | PrismaService = this.prisma): Promise<MachineDetail> {
    const m = await db.machine.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!m) throw new NotFoundException('机型不存在');
    return toDetail(m);
  }

  /** Validates references and normalises input; shared by create and update. */
  private async prepare(dto: MachineInputDto, tx: Tx, excludeId?: string) {
    const slugOwner = await tx.machine.findUnique({ where: { slug: dto.slug }, select: { id: true } });
    if (slugOwner && slugOwner.id !== excludeId) throw new ConflictException(`slug "${dto.slug}" 已被其他机型使用`);

    if (!(await tx.category.findUnique({ where: { id: dto.categoryId }, select: { id: true } }))) {
      throw new BadRequestException('分类不存在');
    }

    const keys = dto.params.map((p) => p.key);
    const dupKey = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupKey) throw new BadRequestException(`参数键 "${dupKey}" 重复`);

    const mediaIds = dto.images.map((i) => i.mediaId);
    if (new Set(mediaIds).size !== mediaIds.length) throw new BadRequestException('同一张图片不能重复添加');
    if (mediaIds.length) {
      const found = await tx.media.count({ where: { id: { in: mediaIds } } });
      if (found !== mediaIds.length) throw new BadRequestException('部分图片不存在，可能已被删除');
    }
    let coverIdx = dto.images.findIndex((i) => i.isCover);
    if (coverIdx < 0) coverIdx = 0;

    const fields = {
      slug: dto.slug,
      model: dto.model.trim(),
      modelKey: compactModel(dto.model),
      categoryId: dto.categoryId,
      nameZh: dto.nameZh.trim(),
      nameEn: dto.nameEn.trim(),
      summaryZh: blankToNull(dto.summaryZh),
      summaryEn: blankToNull(dto.summaryEn),
      status: dto.status,
      featured: dto.featured,
      seoTitleZh: blankToNull(dto.seoTitleZh),
      seoTitleEn: blankToNull(dto.seoTitleEn),
      seoDescZh: blankToNull(dto.seoDescZh),
      seoDescEn: blankToNull(dto.seoDescEn),
      notes: blankToNull(dto.notes),
    };
    const params = dto.params.map((p, i) => ({
      key: p.key,
      labelZh: p.labelZh.trim(),
      labelEn: p.labelEn.trim(),
      valueZh: p.valueZh.trim(),
      valueEn: p.valueEn.trim(),
      sort: (i + 1) * 10,
    }));
    const images = dto.images.map((img, i) => ({ mediaId: img.mediaId, isCover: i === coverIdx, sort: i * 10 }));
    return { fields, params, images };
  }

  private async nextSort(tx: Tx, categoryId: string) {
    const agg = await tx.machine.aggregate({ where: { categoryId }, _max: { sort: true } });
    return (agg._max.sort ?? 0) + 10;
  }

  private async writeChildren(tx: Tx, machineId: string, p: Awaited<ReturnType<MachinesService['prepare']>>) {
    await tx.machineParam.deleteMany({ where: { machineId } });
    await tx.machineImage.deleteMany({ where: { machineId } });
    if (p.params.length) await tx.machineParam.createMany({ data: p.params.map((x) => ({ ...x, machineId })) });
    if (p.images.length) await tx.machineImage.createMany({ data: p.images.map((x) => ({ ...x, machineId })) });
  }

  async create(dto: MachineInputDto, userId: string) {
    const detail = await this.prisma.$transaction(async (tx) => {
      const p = await this.prepare(dto, tx);
      const m = await tx.machine.create({ data: { ...p.fields, sort: await this.nextSort(tx, p.fields.categoryId) } });
      await this.writeChildren(tx, m.id, p);
      return this.get(m.id, tx);
    });
    await this.audit.log({ userId, action: 'create', entity: 'machine', entityId: detail.id, diff: { slug: detail.slug, model: detail.model } });
    return detail;
  }

  async update(id: string, dto: MachineInputDto, userId: string) {
    const { before, after } = await this.prisma.$transaction(async (tx) => {
      const before = await this.get(id, tx);
      const p = await this.prepare(dto, tx, id);
      // Moving to another category appends the machine to the end of that category.
      const sort = p.fields.categoryId !== before.categoryId ? await this.nextSort(tx, p.fields.categoryId) : undefined;
      await tx.machine.update({ where: { id }, data: { ...p.fields, sort } });
      await this.writeChildren(tx, id, p);
      return { before, after: await this.get(id, tx) };
    });

    const b = snapshot(before);
    const a = snapshot(after);
    const diff: Record<string, unknown> = diffFields(b.scalars, a.scalars, [...SCALAR_FIELDS]);
    const params = diffKeyed(b.params, a.params, (x) => x.key);
    if (params) diff.params = params;
    const images = diffKeyed(b.images, a.images, (x) => x.mediaId);
    if (images) diff.images = images;
    if (Object.keys(diff).length) {
      await this.audit.log({ userId, action: 'update', entity: 'machine', entityId: id, diff: { model: after.model, ...diff } as object });
    }
    return after;
  }

  async remove(id: string, userId: string) {
    const m = await this.prisma.machine.findUnique({ where: { id }, select: { slug: true, model: true } });
    if (!m) throw new NotFoundException('机型不存在');
    await this.prisma.machine.delete({ where: { id } });
    await this.audit.log({ userId, action: 'delete', entity: 'machine', entityId: id, diff: m });
  }

  async duplicate(id: string, userId: string) {
    const detail = await this.prisma.$transaction(async (tx) => {
      const src = await this.get(id, tx);
      let slug = `${src.slug}-copy`.slice(0, 64);
      for (let n = 2; await tx.machine.findUnique({ where: { slug }, select: { id: true } }); n++) {
        slug = `${src.slug.slice(0, 55)}-copy-${n}`;
      }
      const dto: MachineInputDto = {
        ...src,
        slug,
        status: 'DRAFT',
        featured: false,
        images: src.images.map((i) => ({ mediaId: i.mediaId, isCover: i.isCover })),
      };
      const p = await this.prepare(dto, tx);
      const m = await tx.machine.create({ data: { ...p.fields, sort: await this.nextSort(tx, p.fields.categoryId) } });
      await this.writeChildren(tx, m.id, p);
      return this.get(m.id, tx);
    });
    await this.audit.log({ userId, action: 'duplicate', entity: 'machine', entityId: detail.id, diff: { from: id, slug: detail.slug } });
    return detail;
  }

  async batch(ids: string[], action: BatchAction, userId: string) {
    const where = { id: { in: ids } };
    const data: Record<Exclude<BatchAction, 'delete'>, Prisma.MachineUpdateManyMutationInput> = {
      publish: { status: 'PUBLISHED' },
      hide: { status: 'HIDDEN' },
      draft: { status: 'DRAFT' },
      feature: { featured: true },
      unfeature: { featured: false },
    };
    const { count } =
      action === 'delete'
        ? await this.prisma.machine.deleteMany({ where })
        : await this.prisma.machine.updateMany({ where, data: data[action] });
    await this.audit.log({ userId, action: `batch_${action}`, entity: 'machine', diff: { ids, count } });
    return { count };
  }

  async reorder(categoryId: string, ids: string[], userId: string) {
    const rows = await this.prisma.machine.findMany({ where: { categoryId }, select: { id: true } });
    const known = new Set(rows.map((r) => r.id));
    if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
      throw new BadRequestException('排序列表必须包含该分类下的全部机型且不能重复');
    }
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.machine.update({ where: { id }, data: { sort: (i + 1) * 10 } })));
    await this.audit.log({ userId, action: 'reorder', entity: 'machine', diff: { categoryId, ids } });
  }
}
