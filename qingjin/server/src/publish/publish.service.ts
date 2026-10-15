import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { AuditService } from '../audit/audit.service';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { publishPaths } from './publish.config';
import { BuildError, buildSite, pruneReleases, removeWorkDir, SiteSnapshot, switchLink } from './site-builder';
import { buildSiteData, SiteMachine } from './site-export';
import { buildPublishedSettings } from '../settings/site-settings';

export type PreviewState = { status: 'idle' | 'building' | 'ready' | 'failed'; builtAt: Date | null; log: string | null; startedBy: string | null };

const RELEASE_LIST_SELECT = {
  id: true,
  version: true,
  note: true,
  status: true,
  rollbackOf: true,
  createdAt: true,
  finishedAt: true,
  createdBy: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.ReleaseSelect;

/** Which top-level parts of a machine differ, in words an editor understands. */
function machineChanges(a: SiteMachine, b: SiteMachine): string[] {
  const out: string[] = [];
  if (a.model !== b.model) out.push('型号');
  if (!isDeepStrictEqual(a.name, b.name)) out.push('名称');
  if (a.category !== b.category) out.push('分类');
  if (a.image !== b.image) out.push('封面');
  if (Boolean(a.featured) !== Boolean(b.featured)) out.push('推荐');
  if (!isDeepStrictEqual(a.params, b.params)) out.push('参数');
  return out;
}

@Injectable()
export class PublishService implements OnModuleInit {
  private readonly logger = new Logger(PublishService.name);
  readonly paths = publishPaths();
  /** Builds run strictly one at a time; Astro builds are CPU-heavy and share the work directory root. */
  private queue: Promise<unknown> = Promise.resolve();
  private starting = false;
  /** Settles when the most recently queued release build finishes (used by the CLI). */
  lastBuild: Promise<unknown> = Promise.resolve();
  private preview: PreviewState = { status: 'idle', builtAt: null, log: null, startedBy: null };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (existsSync(join(this.paths.preview, 'zh', 'index.html'))) this.preview = { ...this.preview, status: 'ready' };
  }

  /**
   * Called once by the API server at startup: a restart kills any in-flight build, so record that instead of
   * leaving it "building" forever. Not run by the CLI, which may start while the server is mid-build.
   */
  async recoverInterrupted() {
    const { count } = await this.prisma.release.updateMany({
      where: { status: { in: ['PENDING', 'BUILDING'] } },
      data: { status: 'FAILED', finishedAt: new Date(), log: '服务重启，发布被中断，请重新发布' },
    });
    if (count) this.logger.warn(`marked ${count} interrupted release(s) as failed`);
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async snapshot(): Promise<SiteSnapshot> {
    const { machines, categories, coverFiles } = await buildSiteData(this.prisma);
    const { site, siteFiles } = await buildPublishedSettings(this.prisma);
    return { machines, categories, site, coverFiles, siteFiles };
  }

  async live() {
    return this.prisma.release.findFirst({ where: { status: 'SUCCESS' }, orderBy: { version: 'desc' } });
  }

  async list(page: number, pageSize: number) {
    const [total, items, live] = await this.prisma.$transaction([
      this.prisma.release.count(),
      this.prisma.release.findMany({ orderBy: { version: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, select: RELEASE_LIST_SELECT }),
      this.prisma.release.findFirst({ where: { status: 'SUCCESS' }, orderBy: { version: 'desc' }, select: { version: true } }),
    ]);
    return { total, liveVersion: live?.version ?? null, items: items.map((r) => ({ ...r, isLive: r.version === live?.version })) };
  }

  async get(id: string) {
    const r = await this.prisma.release.findUnique({ where: { id }, select: { ...RELEASE_LIST_SELECT, log: true, snapshot: true } });
    if (!r) throw new NotFoundException('发布记录不存在');
    const snap = r.snapshot as unknown as SiteSnapshot;
    const { snapshot: _omit, ...rest } = r;
    return { ...rest, summary: { machines: snap.machines.length, categories: snap.categories.length, images: snap.coverFiles.length } };
  }

  /** What the next publish would change compared with the live site. */
  async pending() {
    const [next, live] = await Promise.all([this.snapshot(), this.live()]);
    if (!live) {
      return { hasLive: false, hasChanges: true, liveVersion: null, machines: { added: next.machines.map(brief), removed: [], changed: [] }, categoriesChanged: true, siteChanged: true };
    }
    const prev = live.snapshot as unknown as SiteSnapshot;
    const before = new Map(prev.machines.map((m) => [m.id, m]));
    const after = new Map(next.machines.map((m) => [m.id, m]));
    const added = next.machines.filter((m) => !before.has(m.id)).map(brief);
    const removed = prev.machines.filter((m) => !after.has(m.id)).map(brief);
    const changed = next.machines
      .filter((m) => before.has(m.id))
      .map((m) => ({ ...brief(m), fields: machineChanges(before.get(m.id)!, m) }))
      .filter((m) => m.fields.length);
    const orderChanged =
      !added.length && !removed.length && !isDeepStrictEqual(prev.machines.map((m) => m.id), next.machines.map((m) => m.id));
    const categoriesChanged = !isDeepStrictEqual(prev.categories, next.categories);
    const siteChanged = !isDeepStrictEqual(prev.site, next.site);
    return {
      hasLive: true,
      liveVersion: live.version,
      hasChanges: Boolean(added.length || removed.length || changed.length || orderChanged || categoriesChanged || siteChanged),
      machines: { added, removed, changed },
      orderChanged,
      categoriesChanged,
      siteChanged,
    };
  }

  private async assertIdle() {
    const busy = await this.prisma.release.findFirst({ where: { status: { in: ['PENDING', 'BUILDING'] } }, select: { version: true } });
    if (busy) throw new ConflictException(`版本 v${busy.version} 正在发布中，请等待完成`);
  }

  /** Creates the release row now and builds in the background; poll GET /releases/:id for the outcome. */
  async publish(note: string | undefined, userId: string | null, rollbackOf?: { version: number; snapshot: SiteSnapshot }) {
    // Set synchronously so two simultaneous clicks can't both pass the idle check.
    if (this.starting) throw new ConflictException('已有发布正在启动，请稍候');
    this.starting = true;
    try {
      return await this.createRelease(note, userId, rollbackOf);
    } finally {
      this.starting = false;
    }
  }

  private async createRelease(note: string | undefined, userId: string | null, rollbackOf?: { version: number; snapshot: SiteSnapshot }) {
    await this.assertIdle();
    const snapshot = rollbackOf?.snapshot ?? (await this.snapshot());
    if (!snapshot.machines.length) throw new BadRequestException('没有已上架的机型，无法发布');
    const release = await this.prisma.release.create({
      data: {
        note: note?.trim() || (rollbackOf ? `回滚到 v${rollbackOf.version}` : null),
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
        createdById: userId,
        rollbackOf: rollbackOf?.version,
      },
      select: RELEASE_LIST_SELECT,
    });
    await this.audit.log({
      userId,
      action: rollbackOf ? 'rollback' : 'publish',
      entity: 'release',
      entityId: release.id,
      diff: { version: release.version, rollbackOf: rollbackOf?.version ?? null },
    });
    this.lastBuild = this.enqueue(() => this.runRelease(release.id, release.version, snapshot));
    return release;
  }

  async rollback(id: string, note: string | undefined, userId: string) {
    const target = await this.prisma.release.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('发布记录不存在');
    if (target.status !== 'SUCCESS') throw new BadRequestException('只能回滚到发布成功的版本');
    const live = await this.live();
    if (live?.id === target.id) throw new BadRequestException(`v${target.version} 已经是线上版本`);
    return this.publish(note, userId, { version: target.version, snapshot: target.snapshot as unknown as SiteSnapshot });
  }

  private async runRelease(id: string, version: number, snapshot: SiteSnapshot) {
    const p = this.paths;
    const outDir = join(p.releases, `v${version}`);
    const workDir = join(p.work, `v${version}`);
    await this.prisma.release.update({ where: { id }, data: { status: 'BUILDING' } });
    try {
      await mkdir(p.releases, { recursive: true });
      const log = await buildSite(snapshot, p, workDir, outDir, { trackEndpoint: p.trackEndpoint });
      await switchLink(p.current, outDir);
      await this.prisma.release.update({ where: { id }, data: { status: 'SUCCESS', log, finishedAt: new Date() } });
      await pruneReleases(p.releases, p.keepReleases, new Set([`v${version}`]));
      this.logger.log(`release v${version} is live`);
    } catch (err) {
      const log = err instanceof BuildError ? err.log : String((err as Error).stack ?? err);
      await this.prisma.release.update({ where: { id }, data: { status: 'FAILED', log, finishedAt: new Date() } });
      await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
      this.logger.error(`release v${version} failed: ${(err as Error).message}`);
    } finally {
      await removeWorkDir(workDir).catch(() => undefined);
    }
  }

  previewState(): PreviewState {
    return this.preview;
  }

  /** Builds the current database state into the preview directory; the live site is untouched. */
  startPreview(username: string) {
    if (this.preview.status === 'building') throw new ConflictException('预览正在构建中');
    this.preview = { status: 'building', builtAt: null, log: null, startedBy: username };
    void this.enqueue(async () => {
      const p = this.paths;
      const workDir = join(p.work, 'preview');
      const outDir = `${p.preview}.next`;
      try {
        // Preview visits must not count as site traffic.
        const log = await buildSite(await this.snapshot(), p, workDir, outDir, { trackEndpoint: '' });
        await rm(p.preview, { recursive: true, force: true });
        await rename(outDir, p.preview);
        this.preview = { status: 'ready', builtAt: new Date(), log, startedBy: username };
      } catch (err) {
        const log = err instanceof BuildError ? err.log : String((err as Error).stack ?? err);
        this.preview = { status: 'failed', builtAt: new Date(), log, startedBy: username };
        await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
      } finally {
        await removeWorkDir(workDir).catch(() => undefined);
      }
    });
    return this.preview;
  }
}

const brief = (m: SiteMachine) => ({ slug: m.id, model: m.model, nameZh: m.name.zh });
