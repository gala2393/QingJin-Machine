import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PublishService } from '../publish/publish.service';
import { addDays, CleanEvent, dayIn, daysBetween, deviceOf, SITE_PATH_SQL, visitorIdOf } from './track';

const ROLLUP_EVERY_MS = 10 * 60_000;
/** The dashboard re-aggregates today at most this often, so numbers are near-live without per-request cost. */
const TODAY_STALE_MS = 60_000;
const MAX_RANGE_DAYS = 366;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Totals = { pv: number; uv: number; machineViews: number; inquiries: number; searches: number };

@Injectable()
export class StatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsService.name);
  readonly tz: string;
  private readonly secret: string;
  private readonly retentionDays: number;
  private timer?: NodeJS.Timeout;
  private todayRolledAt = 0;
  private rollupQueue: Promise<unknown> = Promise.resolve();
  private todayRefresh?: Promise<void>;
  private purgedOn = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly publish: PublishService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('STATS_TZ') ?? 'Asia/Shanghai';
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.retentionDays = Math.max(30, Number(config.get('TRACK_RETENTION_DAYS') ?? 180));
  }

  onModuleInit() {
    // Catch up on days that ended while the server was down, then keep today/yesterday fresh.
    void this.maintain(3);
    this.timer = setInterval(() => void this.maintain(2), ROLLUP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async record(ev: CleanEvent, ip: string, ua: string, country: string | undefined) {
    const now = new Date();
    const cc = country && /^[A-Z]{2}$/.test(country) && country !== 'T1' ? country : 'XX';
    await this.prisma.trackEvent.create({
      data: { ...ev, country: cc, device: deviceOf(ua), visitorId: visitorIdOf(this.secret, dayIn(this.tz, now), ip, ua), createdAt: now },
    });
  }

  private async maintain(days: number) {
    try {
      const today = dayIn(this.tz);
      for (let i = days - 1; i >= 0; i--) await this.rollup(addDays(today, -i));
      this.todayRolledAt = Date.now();
      if (this.purgedOn !== today) {
        const { count } = await this.prisma.trackEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - this.retentionDays * 86_400_000) } } });
        this.purgedOn = today;
        if (count) this.logger.log(`purged ${count} raw events older than ${this.retentionDays} days`);
      }
    } catch (err) {
      this.logger.error(`stats maintenance failed: ${(err as Error).message}`);
    }
  }

  /** Recomputes every DailyStat row of one business day from the raw events (idempotent). */
  rollup(day: string) {
    // Concurrent delete+insert of the same day would collide on the primary key, so run one at a time.
    const run = this.rollupQueue.then(() => this.rollupNow(day));
    this.rollupQueue = run.catch(() => undefined);
    return run;
  }

  private async rollupNow(day: string) {
    const tz = this.tz;
    // createdAt is a UTC timestamp without zone; convert the local day's bounds to UTC for the index range.
    await this.prisma.$transaction([
      // Also serializes across API processes; released at commit.
      this.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'rollup:' + day}))::text`,
      this.prisma.$executeRaw`DELETE FROM "DailyStat" WHERE "date" = ${day}::date`,
      this.prisma.$executeRaw`
        WITH ev AS (
          SELECT * FROM "TrackEvent"
          WHERE "createdAt" >= ((${day}::date)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'
            AND "createdAt" <  ((${day}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'
            AND "path" ~ ${SITE_PATH_SQL}
        ), pv AS (SELECT * FROM ev WHERE "type" = 'pageview')
        INSERT INTO "DailyStat" ("date", "metric", "dimension", "value")
        SELECT ${day}::date, m, d, v FROM (
          SELECT 'pv' AS m, '' AS d, count(*)::int AS v FROM pv HAVING count(*) > 0
          UNION ALL SELECT 'uv', '', count(DISTINCT "visitorId")::int FROM pv HAVING count(*) > 0
          UNION ALL SELECT 'machine_view', "machineSlug", count(*)::int FROM pv WHERE "machineSlug" IS NOT NULL GROUP BY 2
          UNION ALL SELECT 'page', "path", count(*)::int FROM pv GROUP BY 2
          UNION ALL SELECT 'referrer', "referrer", count(*)::int FROM pv WHERE "referrer" IS NOT NULL GROUP BY 2
          UNION ALL SELECT 'country', coalesce("country", 'XX'), count(*)::int FROM pv GROUP BY 2
          UNION ALL SELECT 'device', coalesce("device", 'desktop'), count(DISTINCT "visitorId")::int FROM pv GROUP BY 2
          UNION ALL SELECT 'lang', "lang", count(*)::int FROM pv WHERE "lang" IS NOT NULL GROUP BY 2
          UNION ALL SELECT 'inquiry', "channel", count(*)::int FROM ev WHERE "type" = 'inquiry' AND "channel" IS NOT NULL GROUP BY 2
          UNION ALL SELECT 'compare', "machineSlug", count(*)::int FROM ev WHERE "type" = 'compare' AND "machineSlug" IS NOT NULL GROUP BY 2
          UNION ALL SELECT 'search', lower("query"), count(*)::int FROM ev WHERE "type" = 'search' AND "query" IS NOT NULL GROUP BY 2
          UNION ALL SELECT 'search_zero', lower("query"), count(*)::int FROM ev WHERE "type" = 'search' AND "query" IS NOT NULL AND "resultCount" = 0 GROUP BY 2
        ) t`,
    ]);
  }

  private freshToday() {
    if (Date.now() - this.todayRolledAt <= TODAY_STALE_MS) return Promise.resolve();
    // Concurrent dashboard requests share one refresh.
    this.todayRefresh ??= this.rollup(dayIn(this.tz))
      .then(() => {
        this.todayRolledAt = Date.now();
      })
      .finally(() => {
        this.todayRefresh = undefined;
      });
    return this.todayRefresh;
  }

  private async totals(from: string, to: string): Promise<Totals> {
    const rows = await this.prisma.$queryRaw<{ metric: string; v: number }[]>`
      SELECT "metric", sum("value")::int AS v FROM "DailyStat"
      WHERE "date" BETWEEN ${from}::date AND ${to}::date AND "metric" IN ('pv', 'uv', 'machine_view', 'inquiry', 'search')
      GROUP BY "metric"`;
    const get = (m: string) => rows.find((r) => r.metric === m)?.v ?? 0;
    return { pv: get('pv'), uv: get('uv'), machineViews: get('machine_view'), inquiries: get('inquiry'), searches: get('search') };
  }

  private top(metric: string, from: string, to: string, limit: number) {
    return this.prisma.$queryRaw<{ dimension: string; v: number }[]>`
      SELECT "dimension", sum("value")::int AS v FROM "DailyStat"
      WHERE "metric" = ${metric} AND "date" BETWEEN ${from}::date AND ${to}::date
        AND (${metric} <> 'page' OR "dimension" ~ ${SITE_PATH_SQL})
      GROUP BY "dimension" ORDER BY v DESC, "dimension" LIMIT ${limit}`;
  }

  resolveRange(from?: string, to?: string) {
    const today = dayIn(this.tz);
    const t = to ?? today;
    const f = from ?? addDays(t, -29);
    if (!DAY_RE.test(f) || !DAY_RE.test(t) || Number.isNaN(Date.parse(f)) || Number.isNaN(Date.parse(t))) {
      throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    }
    const days = daysBetween(f, t);
    if (days < 1) throw new BadRequestException('开始日期不能晚于结束日期');
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`时间范围最多 ${MAX_RANGE_DAYS} 天`);
    return { from: f, to: t, days };
  }

  async overview(fromQ?: string, toQ?: string) {
    const range = this.resolveRange(fromQ, toQ);
    const { from, to, days } = range;
    await this.freshToday();
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days - 1));

    const [totals, prevTotals, trendRows, machines, pages, referrers, countries, devices, langs, channels, searches, zero, realtime] = await Promise.all([
      this.totals(from, to),
      this.totals(prevFrom, prevTo),
      this.prisma.$queryRaw<{ date: Date; metric: string; v: number }[]>`
        SELECT "date", "metric", sum("value")::int AS v FROM "DailyStat"
        WHERE "date" BETWEEN ${from}::date AND ${to}::date AND "metric" IN ('pv', 'uv', 'inquiry')
        GROUP BY "date", "metric"`,
      this.top('machine_view', from, to, 10),
      this.top('page', from, to, 10),
      this.top('referrer', from, to, 10),
      this.top('country', from, to, 15),
      this.top('device', from, to, 5),
      this.top('lang', from, to, 5),
      this.top('inquiry', from, to, 10),
      this.top('search', from, to, 15),
      this.top('search_zero', from, to, 15),
      this.prisma.$queryRaw<{ pv: number; visitors: number }[]>`
        SELECT count(*)::int AS pv, count(DISTINCT "visitorId")::int AS visitors FROM "TrackEvent"
        WHERE "type" = 'pageview' AND "createdAt" >= (now() AT TIME ZONE 'UTC') - interval '30 minutes'`,
    ]);

    const byDay = new Map<string, { pv: number; uv: number; inquiries: number }>();
    for (const r of trendRows) {
      const k = r.date.toISOString().slice(0, 10);
      const e = byDay.get(k) ?? { pv: 0, uv: 0, inquiries: 0 };
      if (r.metric === 'pv') e.pv = r.v;
      else if (r.metric === 'uv') e.uv = r.v;
      else e.inquiries = r.v;
      byDay.set(k, e);
    }
    const trend = Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      return { date, ...(byDay.get(date) ?? { pv: 0, uv: 0, inquiries: 0 }) };
    });

    const info = await this.prisma.machine.findMany({
      where: { slug: { in: machines.map((m) => m.dimension) } },
      select: { slug: true, model: true, nameZh: true },
    });
    const bySlug = new Map(info.map((m) => [m.slug, m]));

    return {
      range,
      totals,
      prevTotals,
      trend,
      topMachines: machines.map((m) => ({ slug: m.dimension, model: bySlug.get(m.dimension)?.model ?? null, nameZh: bySlug.get(m.dimension)?.nameZh ?? null, views: m.v })),
      topPages: pages.map((r) => ({ path: r.dimension, pv: r.v })),
      referrers: referrers.map((r) => ({ host: r.dimension, pv: r.v })),
      countries: countries.map((r) => ({ code: r.dimension, pv: r.v })),
      devices: devices.map((r) => ({ device: r.dimension, uv: r.v })),
      langs: langs.map((r) => ({ lang: r.dimension, pv: r.v })),
      inquiryChannels: channels.map((r) => ({ channel: r.dimension, count: r.v })),
      searches: searches.map((r) => ({ query: r.dimension, count: r.v })),
      zeroResultSearches: zero.map((r) => ({ query: r.dimension, count: r.v })),
      realtime: { pv30m: realtime[0]?.pv ?? 0, visitors30m: realtime[0]?.visitors ?? 0 },
      generatedAt: new Date().toISOString(),
    };
  }

  async summary() {
    await this.freshToday();
    const today = dayIn(this.tz);
    const [byStatus, categories, pending, todayTotals] = await Promise.all([
      this.prisma.machine.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.category.count(),
      this.publish.pending(),
      this.totals(today, today),
    ]);
    const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    return {
      machines: { total: count('PUBLISHED') + count('DRAFT') + count('HIDDEN'), published: count('PUBLISHED'), draft: count('DRAFT'), hidden: count('HIDDEN') },
      categories,
      pendingChanges: pending.hasChanges,
      liveVersion: pending.liveVersion,
      today: { pv: todayTotals.pv, uv: todayTotals.uv, inquiries: todayTotals.inquiries },
    };
  }
}
