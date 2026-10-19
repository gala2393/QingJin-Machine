import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Templates and public assets affect previews even when the database snapshot stays the same. */
export async function siteSourceKey(siteDir: string): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (path: string): Promise<void> => {
    const absolute = join(siteDir, path);
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) {
        // These two files are replaced by the database snapshot during every build.
        if (child === 'src/data/machines.json' || child === 'src/data/categories.json') continue;
        hash.update(child).update('\0').update(await readFile(join(siteDir, child))).update('\0');
      }
    }
  };
  await walk('src');
  await walk('public');
  for (const file of ['astro.config.mjs', 'tsconfig.json', 'package.json', 'package-lock.json']) {
    try {
      hash.update(file).update('\0').update(await readFile(join(siteDir, file))).update('\0');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return hash.digest('hex');
}
