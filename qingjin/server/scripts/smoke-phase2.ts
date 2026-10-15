/**
 * Phase-2 write-path smoke test against a running API. Creates and then removes its own data
 * (category "smoke-cat", machines "smoke-*", uploaded test images, user "smoke-viewer").
 *   SMOKE_PASSWORD=<admin password> npx ts-node --transpile-only scripts/smoke-phase2.ts
 */
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { createPrisma } from '../src/cli/db';

const base = process.env.SMOKE_BASE || 'http://localhost:3000/api';
const password = process.env.SMOKE_PASSWORD;
if (!password) throw new Error('set SMOKE_PASSWORD');
const uploadDir = resolve(process.env.UPLOAD_DIR ?? './uploads');
const prisma = createPrisma();

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
async function upload(token: string, file: Buffer, name: string, mime: string, fields: Record<string, string> = {}): Promise<Res> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(file)], { type: mime }), name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${base}/media`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, data: await res.json() };
}
const login = async (username: string, pw: string) => (await call('POST', '/auth/login', undefined, { username, password: pw })).data?.accessToken as string;

async function cleanup() {
  await prisma.machine.deleteMany({ where: { slug: { startsWith: 'smoke-' } } });
  await prisma.category.deleteMany({ where: { slug: 'smoke-cat' } });
  await prisma.user.deleteMany({ where: { username: 'smoke-viewer' } });
}

async function main() {
  await cleanup();
  const admin = await login('admin', password!);
  check('admin login', admin);

  // --- roles ---
  const viewerPw = randomBytes(12).toString('base64url');
  await prisma.user.create({ data: { username: 'smoke-viewer', displayName: '只读测试', role: 'VIEWER', passwordHash: await bcrypt.hash(viewerPw, 10) } });
  const viewer = await login('smoke-viewer', viewerPw);
  check('viewer can read', (await call('GET', '/categories', viewer)).status === 200);
  check('viewer cannot create category -> 403', (await call('POST', '/categories', viewer, { slug: 'x', nameZh: 'x', nameEn: 'x' })).status === 403);
  check('viewer cannot delete machine -> 403', (await call('DELETE', '/machines/whatever', viewer)).status === 403);

  // --- categories & templates ---
  const cat = await call('POST', '/categories', admin, { slug: 'smoke-cat', nameZh: '测试分类', nameEn: 'Smoke Category' });
  check('create category -> 201', cat.status === 201 && cat.data.machineCount === 0);
  const catId: string = cat.data.id;
  check('duplicate category slug -> 409', (await call('POST', '/categories', admin, { slug: 'smoke-cat', nameZh: 'a', nameEn: 'b' })).status === 409);
  check('invalid slug -> 400', (await call('POST', '/categories', admin, { slug: 'Bad Slug', nameZh: 'a', nameEn: 'b' })).status === 400);
  const patched = await call('PATCH', `/categories/${catId}`, admin, { nameZh: '测试分类2', icon: '' });
  check('patch category', patched.status === 200 && patched.data.nameZh === '测试分类2' && patched.data.icon === null);
  const tplItems = [
    { key: 'speed', labelZh: '速度', labelEn: 'Speed' },
    { key: 'power', labelZh: '功率', labelEn: 'Power' },
  ];
  check('duplicate template key -> 400', (await call('PUT', `/categories/${catId}/templates`, admin, { items: [tplItems[0], tplItems[0]] })).status === 400);
  const tpl = await call('PUT', `/categories/${catId}/templates`, admin, { items: tplItems });
  check('put templates', tpl.status === 200 && tpl.data.map((t: any) => t.key).join() === 'speed,power');

  // --- media ---
  const png = await sharp({ create: { width: 1200, height: 800, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } } }).png().toBuffer();
  const m1 = await upload(admin, png, '测试图片.png', 'image/png');
  check('upload png -> square 1200x1200 webp', m1.status === 201 && m1.data.width === 1200 && m1.data.height === 1200, `${m1.data.width}x${m1.data.height}`);
  check('utf-8 filename preserved', m1.data.originalName === '测试图片.png', m1.data.originalName);
  check('uploaded file exists', existsSync(join(uploadDir, m1.data.url.replace(/^\/uploads\//, ''))));
  const again = await upload(admin, png, 'again.png', 'image/png');
  check('identical upload is de-duplicated', again.data.id === m1.data.id);

  // 400x200 stored with EXIF orientation 6 displays as 200x400; crop the top 200x300 without squaring.
  const rotated = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#d04020' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const m2 = await upload(admin, rotated, 'rot.jpg', 'image/jpeg', { crop: JSON.stringify({ x: 0, y: 0, width: 200, height: 300 }), square: 'false' });
  check('EXIF orientation applied before crop', m2.status === 201 && m2.data.width === 200 && m2.data.height === 300, `${m2.data.width}x${m2.data.height}`);
  check('non-image upload -> 400', (await upload(admin, Buffer.from('hello'), 'a.png', 'image/png')).status === 400);
  check('bad crop -> 400', (await upload(admin, png, 'b.png', 'image/png', { crop: '{"x":-1}' })).status === 400);
  check('viewer cannot upload -> 403', (await upload(viewer, png, 'c.png', 'image/png')).status === 403);

  // --- machines ---
  const input = {
    slug: 'smoke-m1',
    model: 'SMK-100',
    categoryId: catId,
    nameZh: '测试机',
    nameEn: 'Smoke Machine',
    summaryZh: '',
    status: 'DRAFT',
    featured: false,
    params: [
      { key: 'speed', labelZh: '速度', labelEn: 'Speed', valueZh: '10包/分', valueEn: '10 bags/min' },
      { key: 'power', labelZh: '功率', labelEn: 'Power', valueZh: '200W', valueEn: '' },
    ],
    images: [
      { mediaId: m1.data.id, isCover: false },
      { mediaId: m2.data.id, isCover: false },
    ],
  };
  const created = await call('POST', '/machines', admin, input);
  check('create machine -> 201', created.status === 201, JSON.stringify(created.data?.message ?? ''));
  const mid: string = created.data.id;
  check('first image becomes cover when none chosen', created.data.images[0].isCover && !created.data.images[1].isCover);
  check('blank optional stored as null', created.data.summaryZh === null);
  check('empty English value allowed', created.data.params[1].valueEn === '');
  check('duplicate machine slug -> 409', (await call('POST', '/machines', admin, input)).status === 409);
  check('duplicate param key -> 400', (await call('POST', '/machines', admin, { ...input, slug: 'smoke-m9', params: [input.params[0], input.params[0]] })).status === 400);
  check('unknown media -> 400', (await call('POST', '/machines', admin, { ...input, slug: 'smoke-m9', images: [{ mediaId: 'nope', isCover: true }] })).status === 400);
  check('unknown category -> 400', (await call('POST', '/machines', admin, { ...input, slug: 'smoke-m9', categoryId: 'nope' })).status === 400);
  check('empty Chinese value -> 400', (await call('POST', '/machines', admin, { ...input, slug: 'smoke-m9', params: [{ ...input.params[0], valueZh: '' }] })).status === 400);
  check('slug-available (taken)', (await call('GET', '/machines/slug-available?slug=smoke-m1', admin)).data.available === false);
  check('slug-available (self excluded)', (await call('GET', `/machines/slug-available?slug=smoke-m1&excludeId=${mid}`, admin)).data.available === true);
  check('search by compact model', (await call('GET', '/machines?q=smk100', admin)).data.items.some((m: any) => m.id === mid));

  const updated = await call('PUT', `/machines/${mid}`, admin, {
    ...input,
    nameEn: 'Smoke Machine v2',
    params: [input.params[1], input.params[0]],
    images: [{ mediaId: m1.data.id, isCover: false }, { mediaId: m2.data.id, isCover: true }],
  });
  check('update machine', updated.status === 200 && updated.data.nameEn === 'Smoke Machine v2' && updated.data.params[0].key === 'power' && updated.data.images[1].isCover);
  const log = await prisma.auditLog.findFirst({ where: { entity: 'machine', entityId: mid, action: 'update' }, orderBy: { createdAt: 'desc' } });
  const diff = log?.diff as any;
  check('audit diff records field + param order + cover change', diff?.nameEn && diff?.params?.reordered && diff?.images?.changed?.length === 2, JSON.stringify(diff));

  const dup1 = await call('POST', `/machines/${mid}/duplicate`, admin);
  const dup2 = await call('POST', `/machines/${mid}/duplicate`, admin);
  check('duplicate -> -copy, DRAFT', dup1.status === 201 && dup1.data.slug === 'smoke-m1-copy' && dup1.data.status === 'DRAFT');
  check('second duplicate -> -copy-2', dup2.data.slug === 'smoke-m1-copy-2');
  check('duplicate keeps params + images', dup1.data.params.length === 2 && dup1.data.images.length === 2);

  const ids = [dup2.data.id, dup1.data.id, mid];
  check('reorder machines -> 204', (await call('PUT', '/machines/order', admin, { categoryId: catId, ids })).status === 204);
  const ordered = await call('GET', `/machines?categoryId=${catId}`, admin);
  check('order applied', ordered.data.items.map((m: any) => m.id).join() === ids.join());
  check('incomplete reorder -> 400', (await call('PUT', '/machines/order', admin, { categoryId: catId, ids: [mid] })).status === 400);

  const pub = await call('POST', '/machines/batch', admin, { ids: [dup1.data.id, dup2.data.id], action: 'publish' });
  check('batch publish', pub.status === 200 && pub.data.count === 2);
  await call('POST', '/machines/batch', admin, { ids: [mid], action: 'feature' });
  const feat = await call('GET', `/machines?categoryId=${catId}&featured=true`, admin);
  check('featured filter', feat.data.total === 1 && feat.data.items[0].id === mid);
  check('bad batch action -> 400', (await call('POST', '/machines/batch', admin, { ids: [mid], action: 'explode' })).status === 400);

  // --- reference protection ---
  const inUse = await call('DELETE', `/media/${m1.data.id}`, admin);
  check('delete media in use -> 409', inUse.status === 409, inUse.data.message);
  check('media usages', (await call('GET', `/media/${m1.data.id}/usages`, admin)).data.length === 3);
  check('unused filter excludes it', !(await call('GET', '/media?unused=true&pageSize=200', admin)).data.items.some((m: any) => m.id === m1.data.id));
  check('delete category with machines -> 409', (await call('DELETE', `/categories/${catId}`, admin)).status === 409);

  // --- cleanup through the API ---
  const del = await call('POST', '/machines/batch', admin, { ids, action: 'delete' });
  check('batch delete', del.data.count === 3);
  for (const m of [m1.data, m2.data]) {
    const r = await call('DELETE', `/media/${m.id}`, admin);
    check(`delete unused media ${m.originalName}`, r.status === 204 && !existsSync(join(uploadDir, m.url.replace(/^\/uploads\//, ''))));
  }
  check('delete empty category -> 204', (await call('DELETE', `/categories/${catId}`, admin)).status === 204);
  check('categories back to 8', (await call('GET', '/categories', admin)).data.length === 8);
}

main()
  .catch((err) => {
    console.error(err);
    failed++;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
    process.exitCode = failed ? 1 : 0;
  });
