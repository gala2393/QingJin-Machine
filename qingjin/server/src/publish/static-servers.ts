import { Logger } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import express from 'express';
import type { Server } from 'node:http';
import { join } from 'node:path';
import type { PublishPaths } from './publish.config';

const COOKIE = 'qj_preview';
const COOKIE_TTL_S = 8 * 3600;

const readCookie = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1];

function siteApp(root: string, uploadDir: string) {
  const app = express();
  app.disable('x-powered-by');
  // Product videos are referenced from the uploads directory instead of being copied into every release.
  app.use('/uploads/videos', express.static(join(uploadDir, 'videos'), { fallthrough: false, maxAge: '30d', immutable: true }));
  app.use(express.static(root, { extensions: ['html'], fallthrough: true }));
  app.use((_req, res) => res.status(404).sendFile('404.html', { root }, (err) => err && res.end()));
  return app;
}

/**
 * Serves the preview build on its own port (its own host in production) because the Astro site uses
 * root-absolute URLs and can't live under a sub-path. Access needs a short-lived link from the admin,
 * which is exchanged for an HttpOnly cookie.
 */
export function startPreviewServer(port: number, paths: PublishPaths, jwt: JwtService): Server {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.get('/__preview_auth', async (req, res) => {
    try {
      await jwt.verifyAsync(String(req.query.t ?? ''), { audience: 'preview-link' });
    } catch {
      res.status(401).type('text').send('预览链接无效或已过期，请回到后台重新打开预览。');
      return;
    }
    const session = await jwt.signAsync({ scope: 'preview' }, { audience: 'preview', expiresIn: COOKIE_TTL_S });
    res.cookie(COOKIE, session, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: COOKIE_TTL_S * 1000, path: '/' });
    res.redirect('/zh/');
  });
  app.use(async (req, res, next) => {
    try {
      await jwt.verifyAsync(readCookie(req.headers.cookie, COOKIE) ?? '', { audience: 'preview' });
      res.setHeader('X-Robots-Tag', 'noindex');
      res.setHeader('Cache-Control', 'no-store');
      next();
    } catch {
      res.status(401).type('text').send('需要从后台的“发布中心 → 预览”打开此页面。');
    }
  });
  app.use(siteApp(paths.preview, paths.uploadDir));
  return app.listen(port, () => Logger.log(`preview site on http://localhost:${port}`, 'Preview'));
}

/** Dev convenience only: serves the live release locally, as nginx does in production. */
export function startLiveSiteServer(port: number, paths: PublishPaths): Server {
  return siteApp(paths.current, paths.uploadDir).listen(port, () => Logger.log(`published site on http://localhost:${port}`, 'Site'));
}
