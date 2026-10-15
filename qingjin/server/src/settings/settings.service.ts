import { BadRequestException, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { AuditService } from '../audit/audit.service';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingsDto } from './settings.dto';
import { loadStored, referencedMediaIds, settingsForAdmin, SITE_SETTINGS_KEY, StoredSiteSettings } from './site-settings';

const trim = (l: { zh: string; en: string }) => ({ zh: l.zh.trim(), en: l.en.trim() });

/** '' when no public address is known; the admin then hides its "visit website" links. */
function publicSiteUrl(): string {
  const configured = process.env.SITE_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const port = process.env.SERVE_SITE_PORT?.trim();
  return port ? `http://localhost:${port}` : '';
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  getSite() {
    return settingsForAdmin(this.prisma);
  }

  async getPublic() {
    const { settings: s } = await loadStored(this.prisma);
    return { name: s.name.zh, phone: s.contact.phone, email: s.contact.email, siteUrl: publicSiteUrl() };
  }

  async putSite(dto: SiteSettingsDto, userId: string) {
    const next: StoredSiteSettings = {
      name: trim(dto.name),
      tagline: trim(dto.tagline),
      factoryPitch: trim(dto.factoryPitch),
      certPitch: trim(dto.certPitch),
      address: trim(dto.address),
      contact: {
        phone: dto.contact.phone.trim(),
        email: dto.contact.email.trim(),
        whatsapp: dto.contact.whatsapp.trim(),
        wechat: dto.contact.wechat.trim(),
      },
      formEndpoint: dto.formEndpoint.trim(),
      aboutImage: dto.aboutImage?.mediaId ?? null,
      wechatQr: dto.wechatQr?.mediaId ?? null,
      factoryPhotos: dto.factoryPhotos.map((p) => ({ mediaId: p.mediaId, title: trim(p.title), desc: trim(p.desc) })),
      certificates: dto.certificates.map((c) => ({ mediaId: c.mediaId, title: trim(c.title), type: c.type.trim() })),
    };

    const ids = [...new Set(referencedMediaIds(next))];
    const found = await this.prisma.media.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('有图片已被删除，请重新选择');

    const { settings: before } = await loadStored(this.prisma);
    const changed = (Object.keys(next) as (keyof StoredSiteSettings)[]).filter((k) => !isDeepStrictEqual(before[k], next[k]));
    if (changed.length) {
      // Preserve keys this version doesn't manage, so a newer site field written elsewhere isn't wiped.
      const row = await this.prisma.siteSetting.findUnique({ where: { key: SITE_SETTINGS_KEY } });
      const value = { ...((row?.value as object | null) ?? {}), ...next } as Prisma.InputJsonValue;
      await this.prisma.siteSetting.upsert({ where: { key: SITE_SETTINGS_KEY }, create: { key: SITE_SETTINGS_KEY, value }, update: { value } });
      const scalarDiff: Record<string, [unknown, unknown]> = {};
      for (const k of changed) {
        if (k === 'factoryPhotos' || k === 'certificates') scalarDiff[k] = [before[k].length, next[k].length];
        else scalarDiff[k] = [before[k], next[k]];
      }
      await this.audit.log({ userId, action: 'update', entity: 'site', entityId: SITE_SETTINGS_KEY, diff: scalarDiff as Prisma.InputJsonValue });
    }
    return this.getSite();
  }
}
