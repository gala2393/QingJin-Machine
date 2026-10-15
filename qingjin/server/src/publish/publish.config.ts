import { resolve, join } from 'node:path';

/** Filesystem layout for builds. Everything lives under PUBLISH_DIR so one volume holds all published output. */
export function publishPaths(env: Record<string, string | undefined> = process.env) {
  const root = resolve(env.PUBLISH_DIR ?? './publish');
  return {
    root,
    releases: join(root, 'releases'),
    /** What nginx serves as the public site: a link to releases/v<N>. */
    current: join(root, 'current'),
    preview: join(root, 'preview'),
    work: join(root, 'work'),
    siteDir: resolve(env.SITE_DIR ?? '../../qingjin-site'),
    uploadDir: resolve(env.UPLOAD_DIR ?? './uploads'),
    keepReleases: Math.max(2, Number(env.KEEP_RELEASES ?? 10)),
    /** Where published pages send analytics beacons; same-origin by default (nginx proxies /api). '' disables. */
    trackEndpoint: env.TRACK_ENDPOINT ?? '/api/track',
  };
}

export type PublishPaths = ReturnType<typeof publishPaths>;
