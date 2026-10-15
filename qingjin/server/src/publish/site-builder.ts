import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, cp, lstat, mkdir, readdir, readFile, readlink, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { SiteCategory, SiteMachine } from './site-export';

export interface SiteSnapshot {
  machines: SiteMachine[];
  categories: SiteCategory[];
  site: unknown;
  /** Cover image paths relative to UPLOAD_DIR. */
  coverFiles: string[];
  /** Site-settings images relative to UPLOAD_DIR; absent in snapshots taken before site settings existed. */
  siteFiles?: string[];
}

export interface BuildOptions {
  /** Analytics beacon URL baked into the pages; '' disables tracking (preview builds). */
  trackEndpoint: string;
}

export interface BuildPaths {
  siteDir: string;
  uploadDir: string;
}

const isWindows = process.platform === 'win32';
// Never copied into a build workspace: dependencies are linked, build output and tooling aren't needed.
const SKIP = new Set(['node_modules', 'dist', '.astro', 'scripts', '.git', '.vscode']);
const BUILD_TIMEOUT_MS = 5 * 60_000;
const MAX_LOG = 100_000;

/**
 * Builds the Astro site from a snapshot into `outDir` without touching the site's own source tree:
 * the source is copied into `workDir`, the data files and cover images are replaced, then `astro build` runs there.
 */
export async function buildSite(snapshot: SiteSnapshot, paths: BuildPaths, workDir: string, outDir: string, opts: BuildOptions): Promise<string> {
  const log: string[] = [];
  const note = (s: string) => log.push(`[${new Date().toISOString()}] ${s}`);

  const missing = [...snapshot.coverFiles, ...(snapshot.siteFiles ?? [])].filter((f) => !existsSync(join(paths.uploadDir, f)));
  if (missing.length) {
    throw new BuildError(`以下图片文件已不存在，无法构建：${missing.slice(0, 10).join('、')}${missing.length > 10 ? ' 等' : ''}`, log);
  }

  await removeWorkDir(workDir);
  await rm(outDir, { recursive: true, force: true });
  await cp(paths.siteDir, workDir, {
    recursive: true,
    filter: (src) => !SKIP.has(relative(paths.siteDir, src).split(/[\\/]/)[0]),
  });
  // Junctions need no admin rights on Windows; elsewhere a plain directory symlink.
  await symlink(join(paths.siteDir, 'node_modules'), join(workDir, 'node_modules'), isWindows ? 'junction' : 'dir');
  note('copied site source');

  const dataDir = join(workDir, 'src', 'data');
  await writeFile(join(dataDir, 'machines.json'), JSON.stringify(snapshot.machines, null, 2));
  await writeFile(join(dataDir, 'categories.json'), JSON.stringify(snapshot.categories, null, 2));
  // Merge over the source's site.json: snapshots from before site settings lack the photo/certificate
  // lists, and the source's defaults (with their images in public/images/site) fill them in.
  const sourceSite = JSON.parse(await readFile(join(dataDir, 'site.json'), 'utf8')) as Record<string, unknown>;
  const site = { ...sourceSite, ...((snapshot.site as Record<string, unknown> | null) ?? {}), trackEndpoint: opts.trackEndpoint };
  await writeFile(join(dataDir, 'site.json'), JSON.stringify(site, null, 2));

  const copyInto = async (dir: string, files: string[]) => {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const f of files) await copyFile(join(paths.uploadDir, f), join(dir, f.split('/').pop()!));
  };
  await copyInto(join(workDir, 'public', 'images', 'machines'), snapshot.coverFiles);
  if (snapshot.siteFiles) await copyInto(join(workDir, 'public', 'images', 'site'), snapshot.siteFiles);
  note(
    `wrote data: ${snapshot.machines.length} machines, ${snapshot.categories.length} categories, ` +
      `${snapshot.coverFiles.length} machine images, ${snapshot.siteFiles?.length ?? 0} site images`,
  );

  const astro = join(paths.siteDir, 'node_modules', 'astro', 'bin', 'astro.mjs');
  if (!existsSync(astro)) throw new BuildError(`展示站依赖未安装：在 ${paths.siteDir} 执行 npm ci`, log);
  note('astro build');
  const { code, output } = await run(process.execPath, [astro, 'build', '--outDir', outDir], workDir);
  log.push(output);
  if (code !== 0) throw new BuildError(`astro build 失败（退出码 ${code}）`, log);
  if (!existsSync(join(outDir, 'zh', 'index.html'))) throw new BuildError('构建结果缺少 zh/index.html', log);
  note('build finished');
  return trimLog(log.join('\n'));
}

/** The workspace links to the site's real node_modules; unlink that first so a recursive delete can never follow it. */
export async function removeWorkDir(workDir: string) {
  const link = join(workDir, 'node_modules');
  try {
    if ((await lstat(link)).isSymbolicLink()) await unlink(link);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await rm(workDir, { recursive: true, force: true });
}

export class BuildError extends Error {
  constructor(
    message: string,
    readonly logLines: string[],
  ) {
    super(message);
  }
  get log() {
    return trimLog([...this.logLines, `ERROR ${this.message}`].join('\n'));
  }
}

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, NODE_ENV: 'production', FORCE_COLOR: '0' } });
    let output = '';
    const add = (b: Buffer) => {
      output += b.toString();
      if (output.length > MAX_LOG * 2) output = output.slice(-MAX_LOG);
    };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const timer = setTimeout(() => {
      output += '\nERROR build timed out';
      child.kill();
    }, BUILD_TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output: stripAnsi(output) });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, output: `${output}\n${err.message}` });
    });
  });
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const trimLog = (s: string) => (s.length > MAX_LOG ? `…(truncated)\n${s.slice(-MAX_LOG)}` : s);

/**
 * Points `link` at `targetDir`. On POSIX the swap is atomic (new symlink renamed over the old one), so nginx
 * never sees a missing site; on Windows (dev only) the junction is replaced in two steps.
 */
export async function switchLink(link: string, targetDir: string) {
  if (isWindows) {
    if (existsSync(link)) await unlink(link);
    await symlink(targetDir, link, 'junction');
    return;
  }
  const tmp = `${link}.tmp-${process.pid}`;
  await rm(tmp, { force: true });
  // Relative target so the link still resolves when the directory is mounted elsewhere (e.g. in nginx).
  await symlink(relative(join(link, '..'), targetDir), tmp, 'dir');
  await rename(tmp, link);
}

export async function readLinkTarget(link: string): Promise<string | null> {
  try {
    return await readlink(link);
  } catch {
    return null;
  }
}

/** Deletes old `v<N>` release directories, keeping the newest `keep` and anything in `protect`. */
export async function pruneReleases(releasesDir: string, keep: number, protect: Set<string>) {
  if (!existsSync(releasesDir)) return;
  const dirs = (await readdir(releasesDir)).filter((d) => /^v\d+$/.test(d)).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  for (const d of dirs.slice(keep)) {
    if (!protect.has(d)) await rm(join(releasesDir, d), { recursive: true, force: true });
  }
}
