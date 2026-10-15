import type { Machine, Category, SiteInfo, Lang } from '../types';
import rawMachines from '../data/machines.json';
import rawCategories from '../data/categories.json';
import rawSite from '../data/site.json';

export const machines: Machine[] = rawMachines as Machine[];
export const categories: Category[] = rawCategories as Category[];
export const siteInfo: SiteInfo = rawSite as SiteInfo;

/** Live totals for marketing copy, so adding or removing machines in the admin updates the text on publish. */
export const catalogCounts = {
  models: machines.length,
  series: categories.filter((c) => machines.some((m) => m.category === c.id)).length,
};

export const PLACEHOLDER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" fill="none"><rect width="400" height="400" fill="%23f4f6fa"/><rect x="80" y="80" width="240" height="240" rx="16" fill="%23e8ecf4" stroke="%23cbd5e1" stroke-width="2"/><path d="M160 160h80v80h-80z" stroke="%231f4fae" stroke-width="3" stroke-dasharray="6 4"/><circle cx="200" cy="200" r="16" fill="%231f4fae"/><text x="200" y="270" text-anchor="middle" fill="%230f2754" font-family="sans-serif" font-size="14" font-weight="600">QING JIN MACHINERY</text></svg>`;

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getCategoryName(id: string, lang: Lang): string {
  const cat = getCategoryById(id);
  if (!cat) return id;
  return cat.name[lang] || cat.name.zh;
}

export function getMachineById(id: string): Machine | undefined {
  return machines.find((m) => m.id === id);
}

export function getMachinesByCategory(catId: string): Machine[] {
  return machines.filter((m) => m.category === catId);
}

export function getFirstMachineOfCategory(catId: string): Machine | undefined {
  return machines.find((m) => m.category === catId);
}

export function getFeaturedMachines(): Machine[] {
  // Data published from the admin carries a featured flag on every machine.
  if (machines.some((m) => typeof m.featured === 'boolean')) {
    const flagged = machines.filter((m) => m.featured);
    return (flagged.length ? flagged : machines).slice(0, 12);
  }

  // Legacy hand-maintained data: a balanced mix of 6 high-demand machines across categories.
  const featuredIds = ['kl-y100', 'dsy-k100', 'ds-200ml', 'qs-ls200ml', 'dz-340', 'ts-170'];
  const featured = featuredIds
    .map((id) => getMachineById(id))
    .filter((m): m is Machine => m !== undefined);
  
  if (featured.length < 6) {
    return machines.slice(0, 6);
  }
  return featured;
}
