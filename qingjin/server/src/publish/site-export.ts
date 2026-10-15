import { basename } from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';

/** Shapes consumed by the Astro showcase site (qingjin-site/src/types). Keep in sync with that repo. */
export interface SiteMachine {
  id: string;
  model: string;
  category: string;
  name: { zh: string; en: string };
  image: string;
  featured?: boolean;
  params: { key: string; zh: string; en: string; value_zh: string; value_en: string }[];
}

export interface SiteCategory {
  id: string;
  name: { zh: string; en: string };
  count: number;
}

export const SITE_IMAGE_DIR = '/images/machines';

/** Builds the showcase site's data files from published machines only. */
export async function buildSiteData(prisma: PrismaClient) {
  const categories = await prisma.category.findMany({ orderBy: { sort: 'asc' } });
  const machines = await prisma.machine.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ category: { sort: 'asc' } }, { sort: 'asc' }],
    include: {
      category: { select: { slug: true } },
      params: { orderBy: { sort: 'asc' } },
      images: { where: { isCover: true }, take: 1, include: { media: { select: { path: true } } } },
    },
  });

  const siteMachines: SiteMachine[] = machines.map((m) => {
    const out: SiteMachine = {
      id: m.slug,
      model: m.model,
      category: m.category.slug,
      name: { zh: m.nameZh, en: m.nameEn },
      image: m.images[0] ? `${SITE_IMAGE_DIR}/${basename(m.images[0].media.path)}` : '',
      featured: m.featured,
      params: m.params.map((p) => ({
        key: p.key,
        zh: p.labelZh,
        en: p.labelEn,
        value_zh: p.valueZh,
        value_en: p.valueEn,
      })),
    };
    return out;
  });
  // Internal fields (notes, brochure source) are deliberately not exported: the site is public.

  const coverFiles = machines.flatMap((m) => (m.images[0] ? [m.images[0].media.path] : []));

  const counts = new Map<string, number>();
  for (const m of siteMachines) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  const siteCategories: SiteCategory[] = categories.map((c) => ({
    id: c.slug,
    name: { zh: c.nameZh, en: c.nameEn },
    count: counts.get(c.slug) ?? 0,
  }));

  /** coverFiles: paths relative to UPLOAD_DIR that the build must copy into public/images/machines. */
  return { machines: siteMachines, categories: siteCategories, coverFiles };
}
