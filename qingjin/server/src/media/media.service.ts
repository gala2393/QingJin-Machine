import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { mediaUrl } from '../common/media-url';
import { Prisma } from '../generated/prisma/client';
import type { Media } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { loadStored, siteUsagesOf } from '../settings/site-settings';
import { CropBox, processImage } from './image-processing';

type MediaUsage = { machineId?: string; slug?: string; model?: string; nameZh?: string; site?: string };
import { ListMediaQuery, UploadMediaDto } from './media.dto';

const view = (m: Media & { _count?: { machineImages: number } }) => ({
  id: m.id,
  url: mediaUrl(m.path),
  originalName: m.originalName,
  width: m.width,
  height: m.height,
  size: m.size,
  usage: m.usage,
  createdAt: m.createdAt,
  usageCount: m._count?.machineImages ?? 0,
});

function parseCrop(raw?: string): CropBox | undefined {
  if (!raw) return undefined;
  const c = JSON.parse(raw) as Partial<CropBox>;
  const nums = [c.x, c.y, c.width, c.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) {
    throw new BadRequestException('crop 需要 x、y、width、height 四个非负数字');
  }
  return c as CropBox;
}

/** Multer decodes multipart filenames as latin1; browsers send UTF-8, so Chinese names arrive garbled. */
const fixFilename = (name: string) => Buffer.from(name, 'latin1').toString('utf8').slice(0, 200);

@Injectable()
export class MediaService {
  private readonly root: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
  }

  async list(q: ListMediaQuery) {
    const where: Prisma.MediaWhereInput = {};
    if (q.q?.trim()) where.originalName = { contains: q.q.trim(), mode: 'insensitive' };
    if (q.unused) where.machineImages = { none: {} };
    if (q.usage) where.usage = q.usage;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.media.count({ where }),
      this.prisma.media.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { machineImages: true } } },
      }),
    ]);
    return { total, items: rows.map(view) };
  }

  async upload(file: Express.Multer.File | undefined, dto: UploadMediaDto, userId: string) {
    if (!file) throw new BadRequestException('请选择要上传的图片');
    const { data, width, height } = await processImage(file.buffer, {
      crop: parseCrop(dto.crop),
      square: dto.square !== 'false',
    });

    const sha256 = createHash('sha256').update(data).digest('hex');
    const existing = await this.prisma.media.findUnique({ where: { sha256 }, include: { _count: { select: { machineImages: true } } } });
    if (existing) return view(existing);

    const rel = `media/${sha256.slice(0, 20)}.webp`;
    const abs = join(this.root, rel);
    await mkdir(dirname(abs), { recursive: true });
    // Write to a temp name first so a half-written file is never served.
    await writeFile(`${abs}.tmp`, data);
    await rename(`${abs}.tmp`, abs);

    try {
      const media = await this.prisma.media.create({
        data: {
          path: rel,
          originalName: fixFilename(file.originalname),
          mime: 'image/webp',
          width,
          height,
          size: data.length,
          sha256,
          usage: dto.usage ?? 'machine',
        },
      });
      await this.audit.log({ userId, action: 'upload', entity: 'media', entityId: media.id, diff: { path: rel, originalName: media.originalName } });
      return view(media);
    } catch (err) {
      // Concurrent upload of the same image: the other request won, reuse its row (same file path).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.media.findUnique({ where: { sha256 }, include: { _count: { select: { machineImages: true } } } });
        if (winner) return view(winner);
      }
      throw err;
    }
  }

  async usages(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id }, select: { id: true } });
    if (!media) throw new NotFoundException('图片不存在');
    const rows = await this.prisma.machineImage.findMany({
      where: { mediaId: id },
      include: { machine: { select: { id: true, slug: true, model: true, nameZh: true } } },
      orderBy: { machine: { model: 'asc' } },
    });
    const { settings } = await loadStored(this.prisma);
    return [
      ...rows.map((r): MediaUsage => ({ machineId: r.machine.id, slug: r.machine.slug, model: r.machine.model, nameZh: r.machine.nameZh })),
      ...siteUsagesOf(settings, id).map((site): MediaUsage => ({ site })),
    ];
  }

  async remove(id: string, userId: string) {
    const used = await this.usages(id);
    const site = used.flatMap((u) => (u.site ? [u.site] : []));
    if (site.length) throw new ConflictException(`该图片正用于站点设置（${site.join('、')}），请先在站点设置中移除`);
    if (used.length) {
      const names = used.slice(0, 5).map((u) => u.model).join('、');
      throw new ConflictException(`该图片正被 ${used.length} 台机型使用（${names}${used.length > 5 ? ' 等' : ''}），请先在机型中移除`);
    }
    const media = await this.prisma.media.delete({ where: { id } });
    await unlink(join(this.root, media.path)).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
    await this.audit.log({ userId, action: 'delete', entity: 'media', entityId: id, diff: { path: media.path, originalName: media.originalName } });
  }
}
