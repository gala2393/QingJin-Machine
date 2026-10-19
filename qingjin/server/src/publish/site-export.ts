import { basename } from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';

/** Shapes consumed by the Astro showcase site (qingjin-site/src/types). Keep in sync with that repo. */
export interface SiteMachineVideo {
  id: string;
  hd: string;
  sd: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
}

export interface SiteMachine {
  id: string;
  model: string;
  category: string;
  name: { zh: string; en: string };
  /** Cover image, used by cards, comparison and share previews. */
  image: string;
  /** All images in display order, cover first; absent in snapshots taken before galleries existed. */
  images?: string[];
  video?: SiteMachineVideo;
  featured?: boolean;
  params: { key: string; zh: string; en: string; value_zh: string; value_en: string }[];
}

export interface SiteCategory {
  id: string;
  name: { zh: string; en: string };
  count: number;
}

export const SITE_IMAGE_DIR = '/images/machines';

/**
 * Videos are not copied into releases (too large); pages link to them where they are stored.
 * Set VIDEO_PUBLIC_BASE to a CDN / object-storage origin to serve them from there instead.
 */
const videoBase = () => (process.env.VIDEO_PUBLIC_BASE || '/uploads').replace(/\/+$/, '');

/** Builds the showcase site's data files from published machines only. */
export async function buildSiteData(prisma: PrismaClient) {
  const categories = await prisma.category.findMany({ orderBy: { sort: 'asc' } });
  const machines = await prisma.machine.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ category: { sort: 'asc' } }, { sort: 'asc' }],
    include: {
      category: { select: { slug: true } },
      params: { orderBy: { sort: 'asc' } },
      images: { orderBy: { sort: 'asc' }, include: { media: { select: { path: true } } } },
      video: true,
    },
  });

  const imageFiles = new Set<string>();
  const base = videoBase();
  const siteMachines: SiteMachine[] = machines.map((m) => {
    // Stable sort keeps the editor's order and only moves the cover to the front.
    const files = [...m.images].sort((a, b) => Number(b.isCover) - Number(a.isCover)).map((i) => i.media.path);
    for (const f of files) imageFiles.add(f);
    const images = files.map((f) => `${SITE_IMAGE_DIR}/${basename(f)}`);
    const v = m.video;
    const out: SiteMachine = {
      id: m.slug,
      model: m.model,
      category: m.category.slug,
      name: { zh: m.nameZh, en: m.nameEn },
      image: images[0] ?? '',
      images,
      featured: m.featured,
      params: m.params.map((p) => ({
        key: p.key,
        zh: p.labelZh,
        en: p.labelEn,
        value_zh: p.valueZh,
        value_en: p.valueEn,
      })),
    };
    if (v?.status === 'READY' && v.hdPath && v.sdPath && v.posterPath && v.width && v.height) {
      out.video = {
        id: v.id,
        hd: `${base}/${v.hdPath}`,
        sd: `${base}/${v.sdPath}`,
        poster: `${base}/${v.posterPath}`,
        width: v.width,
        height: v.height,
        duration: Math.round(v.duration ?? 0),
      };
    }
    return out;
  });
  // Internal fields (notes, brochure source) are deliberately not exported: the site is public.

  const counts = new Map<string, number>();
  for (const m of siteMachines) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  const siteCategories: SiteCategory[] = categories.map((c) => ({
    id: c.slug,
    name: { zh: c.nameZh, en: c.nameEn },
    count: counts.get(c.slug) ?? 0,
  }));

  /** coverFiles: paths relative to UPLOAD_DIR that the build copies into public/images/machines (every gallery image). */
  return { machines: siteMachines, categories: siteCategories, coverFiles: [...imageFiles] };
}
