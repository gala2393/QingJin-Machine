/**
 * One-off (re-runnable) import of the existing Astro site's data into the database.
 *   npm run import:site            import, then verify the round trip
 *   npm run import:site -- --check only verify the database against the site JSON
 *   --machines-only                leave the site settings (factory photos, certificates, contacts) alone
 *   --replace                      also delete machines, categories and videos the site JSON no longer lists
 * Re-running overwrites machine fields and params for every slug present in machines.json.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import sharp from 'sharp';
import { compactModel } from '../common/media-url';
import { buildSiteData, SiteCategory, SiteMachine as ExportedMachine } from '../publish/site-export';
import { buildPublishedSettings, PublishedSiteSettings, StoredSiteSettings } from '../settings/site-settings';

/** The original hand-maintained JSON also carries internal fields that are never published. */
type SiteMachine = Omit<ExportedMachine, 'featured'> & { source?: unknown; notes?: string };
import { createPrisma } from './db';

// Mirrors the hard-coded list in qingjin-site/src/utils/index.ts (getFeaturedMachines).
const FEATURED = ['fm-y100', 'fb-3000', 'zlg-100', 'ds-y100', 'ds-300ml', 'dz-340'];

const siteDir = resolve(process.env.SITE_DIR ?? '../../qingjin-site');
const uploadDir = resolve(process.env.UPLOAD_DIR ?? './uploads');
const readJson = <T>(rel: string): T => JSON.parse(readFileSync(join(siteDir, rel), 'utf8')) as T;

const prisma = createPrisma();

/** Public paths of a machine's pictures, cover first. */
const gallery = (m: SiteMachine): string[] => (m.images?.length ? m.images : m.image ? [m.image] : []);

/** Site JSON keeps extra pictures in a subfolder; the database and the published site use one flat folder. */
const flatName = (publicPath: string) => basename(publicPath);

async function importMachineImage(machineId: string, publicPath: string): Promise<string> {
  const src = join(siteDir, 'public', publicPath);
  if (!existsSync(src)) throw new Error(`${machineId}: image not found ${src}`);
  const buf = readFileSync(src);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const same = await prisma.media.findUnique({ where: { sha256 } });
  if (same) return same.id;
  const rel = `machines/${flatName(publicPath)}`;
  copyFileSync(src, join(uploadDir, rel));
  const meta = await sharp(buf).metadata();
  const data = {
    originalName: flatName(publicPath),
    mime: `image/${meta.format}`,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    size: buf.length,
    sha256,
  };
  // A new picture can reuse an old file name (a replaced catalogue does); the row and file then take the new bytes.
  const media = await prisma.media.upsert({ where: { path: rel }, create: { path: rel, ...data }, update: data });
  return media.id;
}

/**
 * --replace: drop machines, categories and templates that the site JSON no longer has.
 * Only database rows go. Picture and video files stay on disk so older releases can still be rolled back.
 */
async function removeStale(machines: SiteMachine[], categories: SiteCategory[]) {
  const keepMachines = machines.map((m) => m.id);
  const stale = await prisma.machine.findMany({ where: { slug: { notIn: keepMachines } }, select: { id: true, slug: true, videoId: true } });
  const videoIds = [...new Set(stale.map((s) => s.videoId).filter((v): v is string => !!v))];
  const removed = await prisma.machine.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  console.log(`removed machines: ${removed.count}`);
  if (videoIds.length) {
    // Machines are gone, so nothing references these videos any more.
    const gone = await prisma.video.deleteMany({ where: { id: { in: videoIds }, machines: { none: {} } } });
    console.log(`removed video records: ${gone.count}`);
  }
  const cats = await prisma.category.deleteMany({ where: { slug: { notIn: categories.map((c) => c.id) }, machines: { none: {} } } });
  console.log(`removed categories: ${cats.count}`);
}

async function importAll(machines: SiteMachine[], categories: SiteCategory[], site: unknown) {
  const catIds = new Map<string, string>();
  for (const [i, c] of categories.entries()) {
    const row = await prisma.category.upsert({
      where: { slug: c.id },
      create: { slug: c.id, nameZh: c.name.zh, nameEn: c.name.en, sort: (i + 1) * 10 },
      update: { nameZh: c.name.zh, nameEn: c.name.en, sort: (i + 1) * 10 },
    });
    catIds.set(c.id, row.id);
  }
  console.log(`categories: ${categories.length}`);

  mkdirSync(join(uploadDir, 'machines'), { recursive: true });
  const sortInCat = new Map<string, number>();
  let imported = 0;

  for (const m of machines) {
    const categoryId = catIds.get(m.category);
    if (!categoryId) throw new Error(`${m.id}: unknown category ${m.category}`);
    const sort = (sortInCat.get(m.category) ?? 0) + 10;
    sortInCat.set(m.category, sort);

    const fields = {
      model: m.model,
      modelKey: compactModel(m.model),
      categoryId,
      nameZh: m.name.zh,
      nameEn: m.name.en,
      status: 'PUBLISHED' as const,
      featured: FEATURED.includes(m.id),
      sort,
      notes: m.notes ?? null,
      source: (m.source ?? undefined) as object | undefined,
    };

    // Cover first, then the gallery. Gallery pictures can be shared by several machines, so a
    // Media row is looked up by content hash before a new one is created.
    const mediaIds: string[] = [];
    for (const publicPath of gallery(m)) mediaIds.push(await importMachineImage(m.id, publicPath));
    const mediaId = mediaIds[0] ?? null;

    // Section pictures go through the same hash lookup, so a picture shared with the gallery is stored once.
    const sections: { kind: 'TEXT' | 'GALLERY'; titleZh: string; titleEn: string; descZh: string | null; descEn: string | null; sort: number; items: { textZh: string; textEn: string; mediaId: string | null; sort: number }[] }[] = [];
    for (const [si, s] of (m.sections ?? []).entries()) {
      const items: (typeof sections)[number]['items'] = [];
      for (const [ii, it] of s.items.entries()) {
        const itemMedia = it.image ? await importMachineImage(m.id, it.image) : null;
        items.push({ textZh: it.zh, textEn: it.en, mediaId: itemMedia, sort: (ii + 1) * 10 });
      }
      sections.push({
        kind: s.kind === 'gallery' ? 'GALLERY' : 'TEXT',
        titleZh: s.title.zh,
        titleEn: s.title.en,
        descZh: s.desc?.zh || null,
        descEn: s.desc?.en || null,
        sort: (si + 1) * 10,
        items,
      });
    }

    await prisma.$transaction(async (tx) => {
      const row = await tx.machine.upsert({ where: { slug: m.id }, create: { slug: m.id, ...fields }, update: fields });
      await tx.machineParam.deleteMany({ where: { machineId: row.id } });
      await tx.machineParam.createMany({
        data: m.params.map((p, i) => ({
          machineId: row.id,
          key: p.key,
          labelZh: p.zh,
          labelEn: p.en,
          valueZh: p.value_zh,
          valueEn: p.value_en,
          sort: (i + 1) * 10,
        })),
      });
      if (mediaId) {
        // Re-running replaces the gallery, so pictures dropped from the site JSON disappear here too.
        await tx.machineImage.deleteMany({ where: { machineId: row.id, mediaId: { notIn: mediaIds } } });
        for (const [i, id] of mediaIds.entries()) {
          await tx.machineImage.upsert({
            where: { machineId_mediaId: { machineId: row.id, mediaId: id } },
            create: { machineId: row.id, mediaId: id, isCover: i === 0, sort: i * 10 },
            update: { isCover: i === 0, sort: i * 10 },
          });
        }
      }
      await tx.machineSection.deleteMany({ where: { machineId: row.id } });
      for (const s of sections) {
        const { items, ...head } = s;
        await tx.machineSection.create({ data: { ...head, machineId: row.id, items: { create: items } } });
      }
    });
    imported++;
  }
  console.log(`machines: ${imported}`);

  if (process.argv.includes('--replace')) await removeStale(machines, categories);

  // Param templates: every key used in a category, in first-seen order, labelled by its first occurrence.
  let templateCount = 0;
  for (const [slug, categoryId] of catIds) {
    const seen = new Map<string, { zh: string; en: string }>();
    for (const m of machines.filter((x) => x.category === slug)) {
      for (const p of m.params) if (!seen.has(p.key)) seen.set(p.key, { zh: p.zh, en: p.en });
    }
    if (process.argv.includes('--replace')) {
      await prisma.paramTemplate.deleteMany({ where: { categoryId, key: { notIn: [...seen.keys()] } } });
    }
    let i = 0;
    for (const [key, label] of seen) {
      i += 10;
      await prisma.paramTemplate.upsert({
        where: { categoryId_key: { categoryId, key } },
        create: { categoryId, key, labelZh: label.zh, labelEn: label.en, sort: i },
        update: { labelZh: label.zh, labelEn: label.en, sort: i },
      });
      templateCount++;
    }
  }
  console.log(`param templates: ${templateCount}`);

  if (!process.argv.includes('--machines-only')) await importSiteSettings(site as SiteJson);
}

/** The site's own site.json: images are public paths, and trackEndpoint is set per build, not stored. */
type SiteJson = PublishedSiteSettings & { trackEndpoint?: string };

async function importSiteImage(publicPath: string): Promise<string> {
  const src = join(siteDir, 'public', publicPath);
  if (!existsSync(src)) throw new Error(`site image not found ${src}`);
  const buf = readFileSync(src);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const same = await prisma.media.findUnique({ where: { sha256 } });
  if (same) return same.id;
  const rel = `site/${basename(publicPath)}`;
  mkdirSync(join(uploadDir, 'site'), { recursive: true });
  copyFileSync(src, join(uploadDir, rel));
  const meta = await sharp(buf).metadata();
  const media = await prisma.media.upsert({
    where: { path: rel },
    create: { path: rel, originalName: basename(rel), mime: `image/${meta.format}`, width: meta.width ?? 0, height: meta.height ?? 0, size: buf.length, sha256, usage: 'site' },
    update: {},
  });
  return media.id;
}

async function importSiteSettings(site: SiteJson) {
  const stored: StoredSiteSettings = {
    name: site.name,
    tagline: site.tagline,
    factoryPitch: site.factoryPitch,
    certPitch: site.certPitch,
    address: site.address,
    contact: site.contact,
    formEndpoint: site.formEndpoint ?? '',
    aboutImage: site.aboutImage ? await importSiteImage(site.aboutImage) : null,
    wechatQr: site.wechatQr ? await importSiteImage(site.wechatQr) : null,
    factoryPhotos: [],
    certificates: [],
  };
  for (const p of site.factoryPhotos ?? []) stored.factoryPhotos.push({ mediaId: await importSiteImage(p.image), title: p.title, desc: p.desc });
  for (const c of site.certificates ?? []) stored.certificates.push({ mediaId: await importSiteImage(c.image), title: c.title, type: c.type });
  const value = stored as unknown as object;
  await prisma.siteSetting.upsert({ where: { key: 'site' }, create: { key: 'site', value }, update: { value } });
  console.log(`site settings: imported (${stored.factoryPhotos.length} factory photos, ${stored.certificates.length} certificates)`);
}

async function verifySite(site: SiteJson): Promise<boolean> {
  const { site: exported, siteFiles } = await buildPublishedSettings(prisma);
  const { trackEndpoint: _t, ...expected } = site;
  let ok = isDeepStrictEqual(exported, expected);
  if (!ok) console.error('  MISMATCH site settings differ from site.json');
  for (const f of siteFiles) {
    const a = readFileSync(join(uploadDir, f));
    const b = readFileSync(join(siteDir, 'public', 'images', 'site', basename(f)));
    if (!a.equals(b)) {
      ok = false;
      console.error(`  MISMATCH site image ${f} differs`);
    }
  }
  console.log(ok ? `verify site: OK (${siteFiles.length} images identical)` : 'verify site: FAILED');
  return ok;
}

async function verify(machines: SiteMachine[], categories: SiteCategory[]): Promise<boolean> {
  const exported = await buildSiteData(prisma);
  let ok = true;
  const fail = (msg: string) => {
    ok = false;
    console.error(`  MISMATCH ${msg}`);
  };

  if (exported.machines.length !== machines.length) fail(`machine count db=${exported.machines.length} site=${machines.length}`);
  const ids = (list: { id: string }[]) => list.map((x) => x.id).join(',');
  if (ids(exported.machines) !== ids(machines)) fail('machine order differs');
  const byId = new Map(exported.machines.map((m) => [m.id, m]));
  for (const m of machines) {
    const e = byId.get(m.id);
    if (!e) {
      fail(`${m.id} missing in db`);
      continue;
    }
    // The export adds `featured` and leaves out internal fields; compare the rest exactly.
    const { featured, ...rest } = e;
    const { notes: _n, source: _s, ...original } = m;
    // Pictures are stored flat and identical files are stored once, so a path in the export can be
    // another machine's file name. Compare pictures by content, everything else exactly.
    const { image: dbImage, images: dbImages, sections: dbSections, ...dbRest } = rest;
    const { image: _i, images: _is, sections: siteSections, ...siteRest } = original;
    if (!isDeepStrictEqual(dbRest, siteRest)) fail(`${m.id} content differs`);
    const stripImages = (list: typeof siteSections) =>
      (list ?? []).map((s) => ({ ...s, items: s.items.map(({ image: _img, ...it }) => it) }));
    if (!isDeepStrictEqual(stripImages(dbSections), stripImages(siteSections))) fail(`${m.id} sections differ`);
    const sectionImages = (list: typeof siteSections) => (list ?? []).flatMap((s) => s.items.map((it) => it.image ?? ''));
    const wantSecImgs = sectionImages(siteSections).map((p) => (p ? createHash('sha256').update(readFileSync(join(siteDir, 'public', p))).digest('hex') : ''));
    const gotSecImgs = sectionImages(dbSections).map((p) => (p ? createHash('sha256').update(readFileSync(join(uploadDir, p.replace(/^\/images\//, '')))).digest('hex') : ''));
    if (!isDeepStrictEqual(wantSecImgs, gotSecImgs)) fail(`${m.id} section pictures differ`);
    const shaOfSite = (p: string) => createHash('sha256').update(readFileSync(join(siteDir, 'public', p))).digest('hex');
    const shaOfDb = (p: string) => createHash('sha256').update(readFileSync(join(uploadDir, p.replace(/^\/images\//, '')))).digest('hex');
    const wantShas = [...new Set(gallery(m).map(shaOfSite))];
    const gotShas = (dbImages ?? [dbImage]).map(shaOfDb);
    if (!isDeepStrictEqual(gotShas, wantShas) || shaOfDb(dbImage) !== wantShas[0]) fail(`${m.id} pictures differ`);
    if (featured !== FEATURED.includes(m.id)) fail(`${m.id} featured flag differs`);
  }
  const notesInDb = await prisma.machine.count({ where: { notes: { not: null } } });
  const notesInSite = machines.filter((m) => m.notes != null).length;
  if (notesInDb !== notesInSite) fail(`internal notes db=${notesInDb} site=${notesInSite}`);
  if (!isDeepStrictEqual(exported.categories, categories)) fail('categories differ');

  for (const m of machines) {
    for (const p of gallery(m)) {
      const a = readFileSync(join(siteDir, 'public', p));
      // Shared pictures are stored once under the first name that imported them, so find them by content.
      const sha = createHash('sha256').update(a).digest('hex');
      const media = await prisma.media.findUnique({ where: { sha256: sha } });
      if (!media) {
        fail(`${m.id} image ${p} not in db`);
        continue;
      }
      if (!readFileSync(join(uploadDir, media.path)).equals(a)) fail(`${m.id} image bytes differ (${p})`);
    }
  }

  console.log(ok ? `verify: OK (${machines.length} machines, ${categories.length} categories, images identical)` : 'verify: FAILED');
  return ok;
}

async function main() {
  const machines = readJson<SiteMachine[]>('src/data/machines.json');
  const categories = readJson<SiteCategory[]>('src/data/categories.json');
  const site = readJson<SiteJson>('src/data/site.json');
  // --site-only refreshes just the site settings (and their images), leaving machine edits alone.
  const siteOnly = process.argv.includes('--site-only');
  if (!process.argv.includes('--check')) {
    if (siteOnly) await importSiteSettings(site);
    else await importAll(machines, categories, site);
  }
  const okMachines = siteOnly ? true : await verify(machines, categories);
  const okSite = process.argv.includes('--machines-only') ? true : await verifySite(site);
  process.exitCode = okMachines && okSite ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
