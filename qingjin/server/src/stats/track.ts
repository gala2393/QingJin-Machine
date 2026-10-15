import { createHmac } from 'node:crypto';

export const TRACK_TYPES = ['pageview', 'search', 'inquiry', 'compare'] as const;
export const INQUIRY_CHANNELS = ['form', 'email', 'whatsapp', 'phone', 'wechat'] as const;

// Crawlers, link unfurlers, monitors and headless browsers; they would otherwise dominate a small B2B site.
const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|skype|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|java\/|okhttp|go-http|axios|node-fetch|httpclient|libwww|scrapy|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|sogou|360spider|bytespider/i;

/**
 * Paths the showcase site actually serves: "/", "/zh/...", "/en/...". Browser extensions and in-app webviews
 * (e.g. "/hybridaction/zybTrackerStatisticsAction") fire beacons from paths that don't exist on the site.
 * SITE_PATH_SQL is the same pattern for Postgres `~`, used to filter rows recorded before this check existed.
 */
export const SITE_PATH_SQL = '^/((zh|en)(/[a-z0-9][a-z0-9-]*)*/?)?$';
export const SITE_PATH_RE = new RegExp(SITE_PATH_SQL);

export const isBot = (ua: string) => !ua || ua.length < 20 || BOT_RE.test(ua);

export function deviceOf(ua: string): 'desktop' | 'mobile' | 'tablet' {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Anonymous visitor id without cookies: an HMAC of the day, IP and user agent. It changes every day, so
 * visitors can only be counted per day, and it can't be reversed to an IP without the server secret.
 */
export const visitorIdOf = (secret: string, day: string, ip: string, ua: string) =>
  createHmac('sha256', secret).update(`${day}|${ip}|${ua}`).digest('base64url').slice(0, 16);

export interface CleanEvent {
  type: (typeof TRACK_TYPES)[number];
  path: string;
  lang: string | null;
  machineSlug: string | null;
  query: string | null;
  resultCount: number | null;
  channel: string | null;
  referrer: string | null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Validates an untrusted beacon payload; returns null to drop it silently. */
export function cleanEvent(raw: unknown): CleanEvent | null {
  let body = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const type = TRACK_TYPES.find((t) => t === b.type);
  if (!type) return null;
  const path = str(b.path, 200)?.split(/[?#]/)[0] ?? null;
  if (!path || !SITE_PATH_RE.test(path)) return null;
  const lang = b.lang === 'zh' || b.lang === 'en' ? b.lang : null;
  const machine = str(b.machine, 80);
  const referrer = str(b.referrer, 253)?.toLowerCase() ?? null;
  const channel = INQUIRY_CHANNELS.find((c) => c === b.channel) ?? null;
  if (type === 'inquiry' && !channel) return null;
  const query = type === 'search' ? str(b.query, 100) : null;
  if (type === 'search' && !query) return null;
  const n = Number(b.results);
  return {
    type,
    path,
    lang,
    machineSlug: machine && /^[a-z0-9][a-z0-9-]*$/.test(machine) ? machine : null,
    query,
    resultCount: type === 'search' && Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : null,
    channel: type === 'inquiry' ? channel : null,
    referrer: type === 'pageview' && referrer && /^[a-z0-9.-]+$/.test(referrer) ? referrer.replace(/^www\./, '') : null,
  };
}

/** YYYY-MM-DD of `d` in the business timezone. */
export const dayIn = (tz: string, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
