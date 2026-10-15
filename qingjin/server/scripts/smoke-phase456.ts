/**
 * Phases 4–6 smoke test against a running API: site settings, analytics, users, password change,
 * audit log, Excel round trip and backups. Restores everything it changes.
 * Start the API with BACKUP_DIR set (e.g. ./backups-dev) to cover the enabled backup path.
 *   SMOKE_PASSWORD=<admin password> npx ts-node --transpile-only scripts/smoke-phase456.ts
 */
import ExcelJS from 'exceljs';
import { randomBytes } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPrisma } from '../src/cli/db';

const base = process.env.SMOKE_BASE || 'http://localhost:3000/api';
const password = process.env.SMOKE_PASSWORD;
if (!password) throw new Error('set SMOKE_PASSWORD');
const backupDir = process.env.BACKUP_DIR ? resolve(process.env.BACKUP_DIR) : null;
const prisma = createPrisma();
const USER = 'smoke-ed6';
const MARK = '【导入测试】';
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 smoke';

let failed = 0;
const check = (name: string, cond: unknown, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!cond) failed++;
};

type Res = { status: number; data: any; headers: Headers; buf?: Buffer };
async function call(method: string, path: string, token?: string, body?: unknown, raw = false): Promise<Res> {
  const isForm = body instanceof FormData;
  const res = await fetch(base + path, {
    method,
    headers: { ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (raw) return { status: res.status, data: null, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}
const login = async (username: string, pw: string) => (await call('POST', '/auth/login', undefined, { username, password: pw })).data?.accessToken as string;
const track = (ev: object, ua = BROWSER_UA) =>
  fetch(`${base}/track`, { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': ua, 'cf-ipcountry': 'DE' }, body: JSON.stringify(ev) });

async function excelFile(buf: Buffer) {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buf)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'm.xlsx');
  return fd;
}

async function main() {
  await prisma.user.deleteMany({ where: { username: USER } });
  const admin = await login('admin', password!);
  check('admin login', admin);
  const me = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });

  // ---------------- phase 4: site settings ----------------
  const s0 = await call('GET', '/settings/site', admin);
  check('GET settings', s0.status === 200 && s0.data.factoryPhotos?.length === 9 && s0.data.certificates?.length === 7, `${s0.data.factoryPhotos?.length} photos`);
  check('settings images have display urls', s0.data.factoryPhotos?.every((p: any) => p.mediaId && p.url));
  const original = s0.data;
  const { updatedAt: _u, ...body } = original;
  try {
    const put = await call('PUT', '/settings/site', admin, { ...body, tagline: { ...body.tagline, zh: body.tagline.zh + '（测试）' } });
    check('PUT settings', put.status === 200 && put.data.tagline.zh.endsWith('（测试）'));
    const pend = await call('GET', '/releases/pending', admin);
    check('pending shows siteChanged', pend.data?.siteChanged === true);
    const badMedia = await call('PUT', '/settings/site', admin, { ...body, aboutImage: { mediaId: 'nope-missing' } });
    check('unknown mediaId → 400', badMedia.status === 400);
    const badEmail = await call('PUT', '/settings/site', admin, { ...body, contact: { ...body.contact, email: 'not-an-email' } });
    check('bad email → 400', badEmail.status === 400);
    const badEndpoint = await call('PUT', '/settings/site', admin, { ...body, formEndpoint: 'http://insecure.example.com' });
    check('non-https form endpoint → 400', badEndpoint.status === 400);
  } finally {
    const back = await call('PUT', '/settings/site', admin, body);
    check('settings restored', back.status === 200 && back.data.tagline.zh === original.tagline.zh);
  }
  const photoId = original.factoryPhotos[0].mediaId;
  const usages = await call('GET', `/media/${photoId}/usages`, admin);
  check('media usages include site', usages.data?.some?.((u: any) => u.site === '工厂照片'), JSON.stringify(usages.data));
  const del = await call('DELETE', `/media/${photoId}`, admin);
  check('deleting a site image → 409', del.status === 409);

  // ---------------- phase 5: analytics ----------------
  const machine = await prisma.machine.findFirstOrThrow({ where: { status: 'PUBLISHED' }, orderBy: { sort: 'asc' } });
  const tag = randomBytes(4).toString('hex');
  const zeroQuery = `smoke-zero-${tag}`;
  const trackStart = new Date(Date.now() - 1000);
  const bad = [
    await track({ type: 'pageview', path: `/zh/smoke-${tag}/`, lang: 'zh' }, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
    await track({ type: 'nonsense', path: '/' }),
    await track({ type: 'inquiry', path: '/zh/contact/' }), // no channel
    await track({ type: 'pageview', path: `/hybridaction/smoke-${tag}`, lang: 'zh' }), // not a site page
  ];
  check('track always 204', bad.every((r) => r.status === 204));
  const good = [
    await track({ type: 'pageview', path: `/en/products/${machine.slug}/?x=1`, lang: 'en', machine: machine.slug, referrer: 'www.Google.com' }),
    await track({ type: 'pageview', path: `/en/smoke-${tag}/`, lang: 'en' }),
    await track({ type: 'search', path: '/en/', lang: 'en', query: zeroQuery, results: 0 }),
    await track({ type: 'inquiry', path: '/en/contact/', lang: 'en', channel: 'whatsapp' }),
  ];
  check('track good events 204', good.every((r) => r.status === 204));
  const botRows = await prisma.trackEvent.count({ where: { path: `/zh/smoke-${tag}/` } });
  check('bot pageview dropped', botRows === 0);
  const junkRows = await prisma.trackEvent.count({ where: { path: `/hybridaction/smoke-${tag}` } });
  check('non-site path dropped', junkRows === 0);
  const stored = await prisma.trackEvent.findFirst({ where: { path: `/en/products/${machine.slug}/` }, orderBy: { createdAt: 'desc' } });
  check('event cleaned (query stripped, referrer host, country, device)', stored?.referrer === 'google.com' && stored?.country === 'DE' && stored?.device === 'mobile' && !!stored?.visitorId);

  // Today is re-aggregated at most once a minute, so wait for a refresh that includes the events above.
  let ov = await call('GET', '/stats/overview', admin);
  for (let i = 0; i < 16 && !ov.data?.zeroResultSearches?.some((q: any) => q.query === zeroQuery); i++) {
    await new Promise((r) => setTimeout(r, 5000));
    ov = await call('GET', '/stats/overview', admin);
  }
  check('overview 200', ov.status === 200 && ov.data.range?.days === 30 && ov.data.trend?.length === 30);
  check('overview counts today', ov.data.totals?.pv >= 2 && ov.data.totals?.uv >= 1 && ov.data.totals?.inquiries >= 1, JSON.stringify(ov.data.totals));
  check('overview top machine', ov.data.topMachines?.some((m: any) => m.slug === machine.slug && m.model));
  check('overview zero-result search', ov.data.zeroResultSearches?.some((q: any) => q.query === zeroQuery));
  check('overview whatsapp channel', ov.data.inquiryChannels?.some((c: any) => c.channel === 'whatsapp' && c.count >= 1));
  check('overview country + referrer', ov.data.countries?.some((c: any) => c.code === 'DE') && ov.data.referrers?.some((r: any) => r.host === 'google.com'));
  check('overview realtime', ov.data.realtime?.pv30m >= 2);
  check('overview bad range → 400', (await call('GET', '/stats/overview?from=2026-05-01&to=2026-04-01', admin)).status === 400);
  check('overview > 366 days → 400', (await call('GET', '/stats/overview?from=2024-01-01&to=2025-12-31', admin)).status === 400);
  const sum = await call('GET', '/stats/summary', admin);
  check('summary', sum.status === 200 && sum.data.machines?.total >= 100 && sum.data.categories === 8 && sum.data.today?.pv >= 2, JSON.stringify(sum.data));
  // Daily totals are recomputed from raw events by the next rollup, so removing them is enough.
  await prisma.trackEvent.deleteMany({ where: { createdAt: { gte: trackStart }, country: 'DE' } });

  // ---------------- phase 6: users ----------------
  const pw1 = randomBytes(12).toString('base64url');
  const created = await call('POST', '/users', admin, { username: USER, displayName: '测试编辑', role: 'EDITOR', password: pw1 });
  check('create user', created.status === 201 && created.data.role === 'EDITOR' && !('passwordHash' in created.data));
  check('duplicate username → 409', (await call('POST', '/users', admin, { username: USER, displayName: 'x', role: 'VIEWER', password: pw1 })).status === 409);
  check('short password → 400', (await call('POST', '/users', admin, { username: 'smoke-x', displayName: 'x', role: 'VIEWER', password: 'short' })).status === 400);
  const uid = created.data.id;
  let editor = await login(USER, pw1);
  check('editor login', editor);
  check('editor → /users 403', (await call('GET', '/users', editor)).status === 403);
  check('editor → /audit-logs 403', (await call('GET', '/audit-logs', editor)).status === 403);
  check('editor → /backups 403', (await call('GET', '/backups', editor)).status === 403);

  const pw2 = randomBytes(12).toString('base64url');
  check('change password: wrong current → 400', (await call('POST', '/auth/password', editor, { currentPassword: 'wrong-password-1', newPassword: pw2 })).status === 400);
  check('change password: same → 400', (await call('POST', '/auth/password', editor, { currentPassword: pw1, newPassword: pw1 })).status === 400);
  check('change password → 204', (await call('POST', '/auth/password', editor, { currentPassword: pw1, newPassword: pw2 })).status === 204);
  check('current session still works', (await call('GET', '/auth/me', editor)).status === 200);
  editor = await login(USER, pw2);
  check('login with new password', editor);

  check('self-demote → 400', (await call('PATCH', `/users/${me.id}`, admin, { role: 'EDITOR' })).status === 400);
  check('self-disable → 400', (await call('PATCH', `/users/${me.id}`, admin, { active: false })).status === 400);
  check('self-delete → 400', (await call('DELETE', `/users/${me.id}`, admin)).status === 400);

  check('demote to VIEWER', (await call('PATCH', `/users/${uid}`, admin, { role: 'VIEWER' })).data?.role === 'VIEWER');
  const viewerPut = await call('PUT', '/settings/site', editor, body);
  check('demoted user loses write access immediately', viewerPut.status === 403 || viewerPut.status === 401, String(viewerPut.status));
  check('disable user', (await call('PATCH', `/users/${uid}`, admin, { active: false })).data?.active === false);
  check('disabled user → 401 at once', (await call('GET', '/settings/site', editor)).status === 401);
  check('reset password → 204', (await call('POST', `/users/${uid}/password`, admin, { password: randomBytes(12).toString('base64url') })).status === 204);

  // ---------------- audit log ----------------
  const logs = await call('GET', '/audit-logs?entity=user&pageSize=50', admin);
  check('audit log: user actions', logs.status === 200 && logs.data.items.some((l: any) => l.entityId === uid && l.action === 'create'));
  check('audit log: ip recorded', logs.data.items.some((l: any) => l.ip));
  const siteLogs = await call('GET', '/audit-logs?entity=site&action=update', admin);
  check('audit log: site updates', siteLogs.data?.total >= 2);
  const qLogs = await call('GET', `/audit-logs?q=${USER}`, admin);
  check('audit log: q by username', qLogs.data?.total >= 1);
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const dated = await call('GET', `/audit-logs?from=${today}&to=${today}&pageSize=1`, admin);
  check('audit log: date filter', dated.status === 200 && dated.data.total >= 1 && dated.data.items.length === 1);
  const facets = await call('GET', '/audit-logs/facets', admin);
  check('audit facets', facets.data?.entities?.includes('site') && facets.data?.actions?.includes('password_change') && facets.data?.users?.length >= 2);

  check('delete user → 204', (await call('DELETE', `/users/${uid}`, admin)).status === 204);
  const orphan = await call('GET', `/audit-logs?q=${uid}`, admin);
  check('audit history kept after delete', orphan.data?.total >= 1);

  // ---------------- Excel ----------------
  const exp = await call('GET', '/excel/machines', admin, undefined, true);
  check('excel export', exp.status === 200 && exp.headers.get('content-type')?.includes('spreadsheetml') && (exp.buf?.length ?? 0) > 5000, `${exp.buf?.length} bytes`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exp.buf as any);
  const ms = wb.getWorksheet('机型')!;
  check('excel sheets', ['机型', '参数', '分类', '说明'].every((n) => wb.getWorksheet(n)), wb.worksheets.map((w) => w.name).join(','));
  check('excel has all machines', ms.rowCount - 1 === (await prisma.machine.count()), String(ms.rowCount - 1));
  const target = ms.getRow(2);
  const slug = String(target.getCell(1).value);
  const before = await prisma.machine.findUniqueOrThrow({ where: { slug } });
  target.getCell(4).value = before.nameZh + MARK;
  const edited = Buffer.from(await wb.xlsx.writeBuffer());

  const dry = await call('POST', '/excel/machines/import?dryRun=true', admin, await excelFile(edited));
  check('import dry run', dry.status === 200 && dry.data.dryRun && !dry.data.applied && dry.data.errors.length === 0, JSON.stringify(dry.data.errors?.slice(0, 3)));
  check('dry run diff', dry.data.updated?.length === 1 && dry.data.updated[0].slug === slug && dry.data.updated[0].fields.includes('名称'), JSON.stringify(dry.data.updated));
  check('dry run writes nothing', (await prisma.machine.findUniqueOrThrow({ where: { slug } })).nameZh === before.nameZh);

  const wbBad = new ExcelJS.Workbook();
  await wbBad.xlsx.load(edited as any);
  wbBad.getWorksheet('机型')!.getRow(3).getCell(3).value = 'no-such-category';
  const badRes = await call('POST', '/excel/machines/import?dryRun=false', admin, await excelFile(Buffer.from(await wbBad.xlsx.writeBuffer())));
  check('import with error → nothing applied', badRes.status === 200 && badRes.data.errors.length >= 1 && !badRes.data.applied && badRes.data.errors[0].row === 3, JSON.stringify(badRes.data.errors?.[0]));
  check('error import writes nothing', (await prisma.machine.findUniqueOrThrow({ where: { slug } })).nameZh === before.nameZh);
  check('non-xlsx → 400', (await call('POST', '/excel/machines/import', admin, await excelFile(Buffer.from('hello')))).status === 400);

  const apply = await call('POST', '/excel/machines/import?dryRun=false', admin, await excelFile(edited));
  check('import apply', apply.data?.applied === true && (await prisma.machine.findUniqueOrThrow({ where: { slug } })).nameZh === before.nameZh + MARK);
  const restore = await call('POST', '/excel/machines/import?dryRun=false', admin, await excelFile(exp.buf!));
  check('import restore', restore.data?.applied === true && (await prisma.machine.findUniqueOrThrow({ where: { slug } })).nameZh === before.nameZh);
  check('import audited', (await call('GET', '/audit-logs?action=import', admin)).data?.total >= 2);

  // ---------------- backups ----------------
  const b0 = await call('GET', '/backups', admin);
  if (!backupDir) {
    check('backups disabled without BACKUP_DIR', b0.status === 200 && b0.data.enabled === false);
    check('run without BACKUP_DIR → 404', (await call('POST', '/backups/run', admin)).status === 404);
  } else {
    const fake = 'db-20260101-033000.sql.gz';
    writeFileSync(join(backupDir, fake), 'fake-dump');
    writeFileSync(join(backupDir, 'backup.log'), '2026-01-01 03:30:00 开始备份 (定时)\n2026-01-01 03:30:01 备份结束\n');
    writeFileSync(join(backupDir, 'notes.txt'), 'ignore me');
    try {
      const b = await call('GET', '/backups', admin);
      check('backups enabled', b.data?.enabled === true && b.data.keep > 0 && b.data.schedule);
      check('backups list only backup files', b.data.files.length === 1 && b.data.files[0].name === fake && b.data.files[0].type === 'database');
      check('backups log tail', b.data.log.includes('备份结束'));
      const dl = await call('GET', `/backups/${fake}`, admin, undefined, true);
      check('backup download', dl.status === 200 && dl.buf?.toString() === 'fake-dump' && dl.headers.get('content-disposition')?.includes(fake));
      check('backup traversal → 404', (await call('GET', '/backups/..%2F..%2F.env', admin)).status === 404 && (await call('GET', '/backups/notes.txt', admin)).status === 404);
      check('backup run → 202', (await call('POST', '/backups/run', admin)).status === 202 && existsSync(join(backupDir, '.request')));
      check('backup run again → 409', (await call('POST', '/backups/run', admin)).status === 409);
      check('backup pending flag', (await call('GET', '/backups', admin)).data?.requestPending === true);
    } finally {
      for (const f of [fake, 'backup.log', 'notes.txt', '.request']) rmSync(join(backupDir, f), { force: true });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(async () => {
    await prisma.user.deleteMany({ where: { username: USER } }).catch(() => {});
    await prisma.$disconnect();
    console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
    process.exitCode = failed ? 1 : 0;
  });
