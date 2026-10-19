import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { AuditService } from '../audit/audit.service';
import type { Video } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { publishPaths } from '../publish/publish.config';
import { encodeArgs, fitShortEdge, posterArgs, probe, RENDITIONS, run } from './transcode';
import { videoView } from './video-view';
import { CreateVideoUploadDto, MAX_VIDEO_BYTES, VIDEO_CHUNK_BYTES } from './videos.dto';

const VIDEO_EXT = /\.(mp4|mov|m4v|3gp|webm|mkv|avi)$/i;
const STALE_MS = 24 * 3600_000;

const fixFilename = (name: string) => name.slice(0, 200);

@Injectable()
export class VideosService implements OnModuleDestroy {
  private readonly logger = new Logger(VideosService.name);
  private readonly root: string;
  /** Chunks and the joined source live outside UPLOAD_DIR so they are never publicly served. */
  private readonly work: string;
  private readonly ffmpeg: string;
  private readonly ffprobe: string;
  private readonly threads: number;
  private readonly keepReleases: number;
  /** Transcodes run strictly one at a time. */
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
    this.work = resolve(config.get<string>('VIDEO_WORK_DIR') ?? join(publishPaths().root, 'video-work'));
    this.ffmpeg = config.get<string>('FFMPEG_PATH') || 'ffmpeg';
    this.ffprobe = config.get<string>('FFPROBE_PATH') || 'ffprobe';
    this.threads = Math.max(1, Number(config.get<string>('VIDEO_THREADS') ?? 2) || 2);
    this.keepReleases = Math.max(2, Number(config.get<string>('KEEP_RELEASES') ?? 10) || 10);
  }

  private workDir = (id: string) => join(this.work, id);
  private partsDir = (id: string) => join(this.workDir(id), 'parts');
  private sourcePath = (id: string) => join(this.workDir(id), 'source');
  private outDir = (id: string) => join(this.root, 'videos', id);

  /**
   * Called by the API server only (not CLI scripts): resumes transcodes interrupted by a restart and
   * schedules cleanup of abandoned uploads and videos nothing uses any more.
   */
  async startBackground() {
    const stuck = await this.prisma.video.findMany({ where: { status: 'PROCESSING' }, select: { id: true } });
    for (const { id } of stuck) {
      if (existsSync(this.sourcePath(id))) this.enqueue(id);
      else await this.prisma.video.update({ where: { id }, data: { status: 'FAILED', error: '服务重启，转码中断，请重新上传' } });
    }
    this.timer = setInterval(() => void this.cleanup().catch((err) => this.logger.warn(`cleanup failed: ${String(err)}`)), 3600_000);
    this.timer.unref();
    setTimeout(() => void this.cleanup().catch(() => undefined), 60_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async create(dto: CreateVideoUploadDto, userId: string) {
    const isVideo = dto.mime?.startsWith('video/') || VIDEO_EXT.test(dto.fileName);
    if (!isVideo) throw new BadRequestException('请上传视频文件（MP4、MOV 等）');
    if (dto.size > MAX_VIDEO_BYTES) throw new BadRequestException('视频不能超过 600 MB');
    const video = await this.prisma.video.create({
      data: { originalName: fixFilename(dto.fileName), mime: dto.mime ?? null, sourceSize: dto.size, chunkSize: VIDEO_CHUNK_BYTES },
    });
    await mkdir(this.partsDir(video.id), { recursive: true });
    this.logger.log(`upload ${video.id} started by ${userId}: ${dto.size} bytes`);
    return { ...videoView(video), received: [] as number[] };
  }

  async status(id: string) {
    const video = await this.find(id);
    return { ...videoView(video), received: video.status === 'UPLOADING' ? await this.received(id) : [] };
  }

  async putChunk(id: string, index: number, body: unknown) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('分片需要以 application/octet-stream 上传');
    const video = await this.find(id);
    if (video.status !== 'UPLOADING') throw new ConflictException('该视频已上传完成');
    const total = this.totalChunks(video);
    if (index < 0 || index >= total) throw new BadRequestException('分片序号无效');
    const expected = index === total - 1 ? video.sourceSize - video.chunkSize * (total - 1) : video.chunkSize;
    if (body.length !== expected) throw new BadRequestException(`分片大小不正确（应为 ${expected} 字节，实际 ${body.length} 字节）`);
    const dir = this.partsDir(id);
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${index}.part`);
    await writeFile(`${file}.tmp`, body);
    await rename(`${file}.tmp`, file);
  }

  async complete(id: string, userId: string) {
    const video = await this.find(id);
    const total = this.totalChunks(video);
    const have = new Set(await this.received(id));
    const missing = Array.from({ length: total }, (_, i) => i).filter((i) => !have.has(i));
    if (missing.length) throw new BadRequestException(`还有 ${missing.length} 个分片未上传`);

    // Claim the upload first so two simultaneous "complete" calls can't both join the chunks.
    const { count } = await this.prisma.video.updateMany({ where: { id, status: 'UPLOADING' }, data: { status: 'PROCESSING' } });
    if (!count) throw new ConflictException('该视频已上传完成');
    try {
      const src = this.sourcePath(id);
      await this.join(id, total, `${src}.tmp`);
      const size = (await stat(`${src}.tmp`)).size;
      if (size !== video.sourceSize) throw new BadRequestException('合并后的文件大小不一致，请重新上传');
      await rename(`${src}.tmp`, src);
      await rm(this.partsDir(id), { recursive: true, force: true });
    } catch (err) {
      await this.prisma.video.update({ where: { id }, data: { status: 'UPLOADING' } });
      throw err;
    }
    await this.audit.log({ userId, action: 'upload', entity: 'video', entityId: id, diff: { originalName: video.originalName, size: video.sourceSize } });
    this.enqueue(id);
    return this.status(id);
  }

  async remove(id: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id }, include: { machines: { select: { model: true } } } });
    if (!video) throw new NotFoundException('视频不存在');
    if (video.machines.length) {
      throw new ConflictException(`该视频正被机型 ${video.machines.map((m) => m.model).join('、')} 使用，请先在机型中移除`);
    }
    if ((await this.releaseVideoIds()).has(id)) throw new ConflictException('线上或历史版本仍在使用该视频，重新发布后才能删除');
    if (video.status === 'PROCESSING') throw new ConflictException('视频正在处理，请稍后再删除');
    await this.purge(id);
    await this.audit.log({ userId, action: 'delete', entity: 'video', entityId: id, diff: { originalName: video.originalName } });
  }

  private async find(id: string): Promise<Video> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('视频不存在');
    return video;
  }

  private totalChunks = (v: Video) => Math.ceil(v.sourceSize / v.chunkSize);

  private async received(id: string): Promise<number[]> {
    try {
      return (await readdir(this.partsDir(id)))
        .map((f) => /^(\d+)\.part$/.exec(f)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(Number)
        .sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  private async join(id: string, total: number, target: string) {
    const out = createWriteStream(target);
    const failed = new Promise<never>((_, reject) => out.on('error', reject));
    const append = (file: string) =>
      new Promise<void>((done, reject) => {
        const input = createReadStream(file);
        input.on('error', reject);
        input.on('end', done);
        input.pipe(out, { end: false });
      });
    for (let i = 0; i < total; i++) await Promise.race([append(join(this.partsDir(id), `${i}.part`)), failed]);
    await Promise.race([new Promise<void>((done) => out.end(done)), failed]);
  }

  private enqueue(id: string) {
    const job = () => this.transcode(id);
    this.queue = this.queue.then(job, job);
  }

  private async transcode(id: string) {
    const src = this.sourcePath(id);
    const dir = this.outDir(id);
    const started = Date.now();
    try {
      if (!existsSync(src)) throw new Error('原始视频文件丢失，请重新上传');
      const info = await probe(this.ffprobe, src);
      await mkdir(dir, { recursive: true });
      const short = Math.min(info.width, info.height);
      // A source already at or below 720p gets a single rendition used for both qualities.
      const renditions = RENDITIONS.filter((r) => r.name === 'hd' || short > r.shortEdge);
      const outputs: Partial<Record<'hd' | 'sd', { rel: string; size: number; width: number; height: number }>> = {};
      for (const r of renditions) {
        const size = fitShortEdge(info.width, info.height, r.shortEdge);
        const tmp = join(dir, `${r.name}.part.mp4`);
        await run(this.ffmpeg, encodeArgs(src, tmp, r, size, info.hasAudio, this.threads));
        await rename(tmp, join(dir, `${r.name}.mp4`));
        outputs[r.name] = { rel: `videos/${id}/${r.name}.mp4`, size: (await stat(join(dir, `${r.name}.mp4`))).size, ...size };
      }
      const hd = outputs.hd!;
      const sd = outputs.sd ?? hd;

      const jpg = join(dir, 'poster.jpg');
      await run(this.ffmpeg, posterArgs(join(dir, 'hd.mp4'), jpg, Math.min(1, info.duration / 3)), 120_000);
      await sharp(jpg).resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(dir, 'poster.webp'));
      await unlink(jpg).catch(() => undefined);

      await this.prisma.video.update({
        where: { id },
        data: {
          status: 'READY',
          error: null,
          width: hd.width,
          height: hd.height,
          duration: info.duration,
          hdPath: hd.rel,
          sdPath: sd.rel,
          posterPath: `videos/${id}/poster.webp`,
          hdSize: hd.size,
          sdSize: sd.size,
        },
      });
      this.logger.log(`video ${id} ready in ${Math.round((Date.now() - started) / 1000)}s (hd ${hd.size} B, sd ${sd.size} B)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`video ${id} failed: ${message}`);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      await this.prisma.video.update({ where: { id }, data: { status: 'FAILED', error: message.slice(0, 1000) } }).catch(() => undefined);
    } finally {
      await rm(this.workDir(id), { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Video ids referenced by kept release snapshots; their files must stay so rollback keeps working. */
  private async releaseVideoIds() {
    const releases = await this.prisma.release.findMany({
      where: { status: 'SUCCESS' },
      orderBy: { version: 'desc' },
      take: this.keepReleases,
      select: { snapshot: true },
    });
    const ids = new Set<string>();
    for (const r of releases) {
      const machines = (r.snapshot as { machines?: { video?: { id?: string } }[] } | null)?.machines ?? [];
      for (const m of machines) if (m.video?.id) ids.add(m.video.id);
    }
    return ids;
  }

  /** Removes abandoned uploads and unused videos older than a day. */
  private async cleanup() {
    const stale = await this.prisma.video.findMany({
      where: { updatedAt: { lt: new Date(Date.now() - STALE_MS) }, status: { not: 'PROCESSING' }, machines: { none: {} } },
      select: { id: true },
    });
    if (!stale.length) return;
    const inUse = await this.releaseVideoIds();
    for (const { id } of stale) if (!inUse.has(id)) await this.purge(id);
  }

  private async purge(id: string) {
    // The condition guards against a machine linking the video between the check and the delete.
    const { count } = await this.prisma.video.deleteMany({ where: { id, machines: { none: {} } } });
    if (!count) return;
    await rm(this.outDir(id), { recursive: true, force: true });
    await rm(this.workDir(id), { recursive: true, force: true });
    this.logger.log(`video ${id} removed`);
  }
}
