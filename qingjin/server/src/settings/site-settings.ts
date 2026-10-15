import { basename } from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';
import { mediaUrl } from '../common/media-url';

export type L = { zh: string; en: string };

/** What the database stores under SiteSetting key "site": images are media ids. */
export interface StoredSiteSettings {
  name: L;
  tagline: L;
  factoryPhotos: { mediaId: string; title: L; desc: L }[];
  certificates: { mediaId: string; title: L; type: string }[];
  factoryPitch: L;
  certPitch: L;
  address: L;
  contact: { phone: string; email: string; whatsapp: string; wechat: string };
  formEndpoint: string;
  aboutImage: string | null;
  /** WeChat QR code shown on the Contact page. */
  wechatQr: string | null;
}

/** What the showcase site reads from src/data/site.json (qingjin-site/src/types SiteInfo). */
export interface PublishedSiteSettings {
  name: L;
  tagline: L;
  factoryPitch: L;
  certPitch: L;
  address: L;
  contact: StoredSiteSettings['contact'];
  formEndpoint: string;
  aboutImage: string;
  /** '' shows a placeholder on the Contact page. */
  wechatQr: string;
  factoryPhotos: { image: string; title: L; desc: L }[];
  certificates: { image: string; title: L; type: string }[];
}

export const SITE_SETTINGS_KEY = 'site';
export const SITE_IMAGE_DIR = '/images/site';

const emptyL = (): L => ({ zh: '', en: '' });
const asL = (v: unknown): L => {
  const o = (v ?? {}) as Partial<L>;
  return { zh: typeof o.zh === 'string' ? o.zh : '', en: typeof o.en === 'string' ? o.en : '' };
};

/** Tolerates older rows (the original site.json had no photo/certificate lists) and missing keys. */
export function normalizeStored(raw: unknown): StoredSiteSettings {
  const v = (raw ?? {}) as Record<string, any>;
  const c = (v.contact ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  return {
    name: v.name ? asL(v.name) : emptyL(),
    tagline: asL(v.tagline),
    factoryPitch: asL(v.factoryPitch),
    certPitch: asL(v.certPitch),
    address: asL(v.address),
    contact: { phone: str(c.phone), email: str(c.email), whatsapp: str(c.whatsapp), wechat: str(c.wechat) },
    formEndpoint: str(v.formEndpoint),
    aboutImage: typeof v.aboutImage === 'string' && v.aboutImage ? v.aboutImage : null,
    wechatQr: typeof v.wechatQr === 'string' && v.wechatQr ? v.wechatQr : null,
    factoryPhotos: Array.isArray(v.factoryPhotos)
      ? v.factoryPhotos.filter((p: any) => typeof p?.mediaId === 'string').map((p: any) => ({ mediaId: p.mediaId, title: asL(p.title), desc: asL(p.desc) }))
      : [],
    certificates: Array.isArray(v.certificates)
      ? v.certificates.filter((p: any) => typeof p?.mediaId === 'string').map((p: any) => ({ mediaId: p.mediaId, title: asL(p.title), type: str(p.type) }))
      : [],
  };
}

export const referencedMediaIds = (s: StoredSiteSettings) => [
  ...(s.aboutImage ? [s.aboutImage] : []),
  ...(s.wechatQr ? [s.wechatQr] : []),
  ...s.factoryPhotos.map((p) => p.mediaId),
  ...s.certificates.map((p) => p.mediaId),
];

/** Where a media id is used in the settings, in the labels the admin shows. */
export function siteUsagesOf(s: StoredSiteSettings, mediaId: string): string[] {
  const out: string[] = [];
  if (s.aboutImage === mediaId) out.push('关于页大图');
  if (s.wechatQr === mediaId) out.push('微信二维码');
  if (s.factoryPhotos.some((p) => p.mediaId === mediaId)) out.push('工厂照片');
  if (s.certificates.some((p) => p.mediaId === mediaId)) out.push('证书');
  return out;
}

export async function loadStored(prisma: PrismaClient) {
  const row = await prisma.siteSetting.findUnique({ where: { key: SITE_SETTINGS_KEY } });
  return { settings: normalizeStored(row?.value), updatedAt: row?.updatedAt ?? null };
}

async function mediaPaths(prisma: PrismaClient, ids: string[]) {
  const rows = ids.length ? await prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true, path: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.path]));
}

/** Admin view: stored settings with a display URL next to every media id. */
export async function settingsForAdmin(prisma: PrismaClient) {
  const { settings: s, updatedAt } = await loadStored(prisma);
  const paths = await mediaPaths(prisma, referencedMediaIds(s));
  const img = (id: string) => ({ mediaId: id, url: paths.has(id) ? mediaUrl(paths.get(id)!) : '' });
  return {
    ...s,
    aboutImage: s.aboutImage ? img(s.aboutImage) : null,
    wechatQr: s.wechatQr ? img(s.wechatQr) : null,
    factoryPhotos: s.factoryPhotos.map((p) => ({ ...p, ...img(p.mediaId) })),
    certificates: s.certificates.map((p) => ({ ...p, ...img(p.mediaId) })),
    updatedAt,
  };
}

/**
 * Site-facing settings plus the upload-relative files the build must copy into public/images/site.
 * Images whose media row has gone missing are dropped rather than producing broken links.
 */
export async function buildPublishedSettings(prisma: PrismaClient): Promise<{ site: PublishedSiteSettings; siteFiles: string[] }> {
  const { settings: s } = await loadStored(prisma);
  const paths = await mediaPaths(prisma, referencedMediaIds(s));
  const src = (id: string) => `${SITE_IMAGE_DIR}/${basename(paths.get(id)!)}`;
  const site: PublishedSiteSettings = {
    name: s.name,
    tagline: s.tagline,
    factoryPitch: s.factoryPitch,
    certPitch: s.certPitch,
    address: s.address,
    contact: s.contact,
    formEndpoint: s.formEndpoint,
    aboutImage: s.aboutImage && paths.has(s.aboutImage) ? src(s.aboutImage) : '',
    wechatQr: s.wechatQr && paths.has(s.wechatQr) ? src(s.wechatQr) : '',
    factoryPhotos: s.factoryPhotos.filter((p) => paths.has(p.mediaId)).map((p) => ({ image: src(p.mediaId), title: p.title, desc: p.desc })),
    certificates: s.certificates.filter((p) => paths.has(p.mediaId)).map((p) => ({ image: src(p.mediaId), title: p.title, type: p.type })),
  };
  const siteFiles = [...new Set(referencedMediaIds(s).filter((id) => paths.has(id)).map((id) => paths.get(id)!))];
  return { site, siteFiles };
}
