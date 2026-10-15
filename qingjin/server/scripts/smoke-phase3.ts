/**
 * Phase-3 publish pipeline smoke test against a running API (with SERVE_SITE_PORT and PREVIEW_PORT set).
 * Edits one machine name, publishes, checks the live site, rolls back, then restores the database row.
 * Leaves two extra releases (publish + rollback) behind, which is the normal history.
 *   SMOKE_PASSWORD=<admin password> npx ts-node --transpile-only scripts/smoke-phase3.ts
 */
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { createPrisma } from '../src/cli/db';

const base = process.env.SMOKE_BASE || 'http://localhost:3000/api';
const siteBase = process.env.SMOKE_SITE || `http://localhost:${process.env.SERVE_SITE_PORT ?? 4321}`;
const password = process.env.SMOKE_PASSWORD;
if (!password) throw new Error('set SMOKE_PASSWORD');
const prisma = createPrisma();
const MARK = '【发布测试】';

let failed = 0;
const check = (name: string, cond: unknown, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!cond) failed++;
};

type Res = { status: number; data: any };
async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const login = async (username: string, pw: string) => (await call('POST', '/auth/login', undefined, { username, password: pw })).data?.accessToken as string;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitRelease(token: string, id: string) {
  for (let i = 0; i < 120; i++) {
    const r = await call('GET', `/releases/${id}`, token);
    if (r.data?.status === 'SUCCESS' || r.data?.status === 'FAILED') return r.data;
    await sleep(2000);
  }
  throw new Error(`release ${id} did not finish`);
}
async function waitPreview(token: string) {
  for (let i = 0; i < 120; i++) {
    const r = await call('GET', '/releases/preview', token);
    if (r.data?.status !== 'building') return r.data;
    await sleep(2000);
  }
  throw new Error('preview did not finish');
}
const page = async (url: string, cookie?: string) => {
  const res = await fetch(url, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  return { status: res.status, text: await res.text(), headers: res.headers };
};

async function main() {
  await prisma.user.deleteMany({ where: { username: 'smoke-viewer3' } });
  const admin = await login('admin', password!);
  check('admin login', admin);
  const viewerPw = randomBytes(12).toString('base64url');
  await prisma.user.create({ data: { username: 'smoke-viewer3', displayName: '只读测试', role: 'VIEWER', passwordHash: await bcrypt.hash(viewerPw, 10) } });
  const viewer = await login('smoke-viewer3', viewerPw);

  const target = await prisma.machine.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { sort: 'asc' } });
  if (!target) throw new Error('no published machine');
  const originalName = target.nameZh.replace(MARK, '');
  const detailUrl = `${siteBase}/zh/products/${target.slug}/`;

  try {
    // --- baseline ---
    const before = await call('GET', '/releases', admin);
    check('list releases', before.status === 200 && before.data.liveVersion != null, `live v${before.data.liveVersion}`);
    const liveV: number = before.data.liveVersion;
    const liveId: string = before.data.items.find((r: any) => r.isLive).id;
    const p0 = await call('GET', '/releases/pending', admin);
    check('pending: no changes vs live', p0.status === 200 && p0.data.hasChanges === false, JSON.stringify(p0.data.machines));
    check('live site serves detail page', (await page(detailUrl)).status === 200);

    // --- role checks ---
    check('viewer can read releases', (await call('GET', '/releases', viewer)).status === 200);
    check('viewer cannot publish -> 403', (await call('POST', '/releases', viewer, {})).status === 403);
    check('viewer cannot rollback -> 403', (await call('POST', `/releases/${liveId}/rollback`, viewer, {})).status === 403);
    check('viewer cannot build preview -> 403', (await call('POST', '/releases/preview', viewer)).status === 403);
    check('no token -> 401', (await call('GET', '/releases')).status === 401);
    check('rollback to live version -> 400', (await call('POST', `/releases/${liveId}/rollback`, admin, {})).status === 400);
    check('unknown release -> 404', (await call('GET', '/releases/nope', admin)).status === 404);

    // --- edit + pending diff ---
    await prisma.machine.update({ where: { id: target.id }, data: { nameZh: originalName + MARK } });
    const p1 = await call('GET', '/releases/pending', admin);
    const ch = p1.data.machines?.changed ?? [];
    check('pending shows changed machine', p1.data.hasChanges && ch.length === 1 && ch[0].slug === target.slug && ch[0].fields.includes('名称'), JSON.stringify(ch));

    // --- publish ---
    const pub = await call('POST', '/releases', admin, { note: 'smoke 发布' });
    check('publish -> 202', pub.status === 202 && pub.data.status === 'PENDING', `v${pub.data?.version}`);
    const busy = await call('POST', '/releases', admin, {});
    check('second publish while building -> 409', busy.status === 409, busy.data?.message);
    const busyPreview = await call('POST', '/releases/preview', admin);
    const done = await waitRelease(admin, pub.data.id);
    check('publish succeeded', done.status === 'SUCCESS', `${done.status} ${done.log?.slice(-200) ?? ''}`);
    check('release summary', done.summary?.machines > 0 && done.summary?.categories > 0, JSON.stringify(done.summary));
    const live1 = await page(detailUrl);
    check('live site shows edited name', live1.status === 200 && live1.text.includes(MARK));
    const p2 = await call('GET', '/releases/pending', admin);
    check('pending empty after publish', p2.data.hasChanges === false && p2.data.liveVersion === pub.data.version);
    const list1 = await call('GET', '/releases?pageSize=5', admin);
    check('new release is live in list', list1.data.liveVersion === pub.data.version && list1.data.items[0].isLive);

    // --- preview (queued behind the publish above, or built now) ---
    if (busyPreview.status !== 202) await call('POST', '/releases/preview', admin);
    const pv = await waitPreview(admin);
    check('preview built', pv.status === 'ready', pv.status);
    check('preview without cookie -> 401', (await page('http://localhost:4400/zh/')).status === 401);
    check('preview with bad token -> 401', (await page('http://localhost:4400/__preview_auth?t=bad')).status === 401);
    check('API token rejected by preview auth', (await page(`http://localhost:4400/__preview_auth?t=${admin}`)).status === 401);
    const link = await call('POST', '/releases/preview/link', viewer);
    check('preview link', link.status === 200 && link.data.url.includes('/__preview_auth?t='));
    const linkToken = new URL(link.data.url).searchParams.get('t')!;
    check('preview-link token rejected by API', (await call('GET', '/releases', linkToken)).status === 401);
    const auth = await page(link.data.url);
    const setCookie = auth.headers.get('set-cookie') ?? '';
    check('preview auth sets HttpOnly cookie + redirects', auth.status === 302 && /qj_preview=/.test(setCookie) && /HttpOnly/i.test(setCookie));
    const cookie = setCookie.split(';')[0];
    check('preview session cookie rejected by API', (await call('GET', '/releases', cookie.split('=')[1])).status === 401);
    const pvPage = await page(`http://localhost:4400/zh/products/${target.slug}/`, cookie);
    check('preview page with cookie', pvPage.status === 200 && pvPage.text.includes(MARK) && pvPage.headers.get('x-robots-tag') === 'noindex');
    check('preview 404 page', (await page('http://localhost:4400/zh/nope/', cookie)).status === 404);

    // --- rollback ---
    const rb = await call('POST', `/releases/${liveId}/rollback`, admin, {});
    check('rollback -> 202', rb.status === 202 && rb.data.rollbackOf === liveV && rb.data.note === `回滚到 v${liveV}`, JSON.stringify(rb.data));
    const rbDone = await waitRelease(admin, rb.data.id);
    check('rollback succeeded', rbDone.status === 'SUCCESS', rbDone.log?.slice(-200));
    const live2 = await page(detailUrl);
    check('live site restored', live2.status === 200 && !live2.text.includes(MARK) && live2.text.includes(originalName));
    const p3 = await call('GET', '/releases/pending', admin);
    check('pending shows DB edit again after rollback', p3.data.hasChanges && p3.data.machines.changed.length === 1);
  } finally {
    await prisma.machine.update({ where: { id: target.id }, data: { nameZh: originalName } });
    await prisma.user.deleteMany({ where: { username: 'smoke-viewer3' } });
  }
  const p4 = await call('GET', '/releases/pending', admin);
  check('pending clean after DB restore', p4.data.hasChanges === false);

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
