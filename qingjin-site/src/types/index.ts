export type Lang = 'zh' | 'en';

export interface MachineParam {
  key: string;
  zh: string;
  en: string;
  value_zh: string;
  value_en: string;
}

export interface MachineVideo {
  id: string;
  /** 1080p MP4 for desktop / fast connections. */
  hd: string;
  /** 720p MP4 for phones and slow connections; same as hd when the source is small. */
  sd: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
}

/**
 * An extra block on the product page. `text` items are bullet lines; `gallery` items are pictures
 * whose zh/en may be empty captions. Mirrors the admin's SiteSection export.
 */
export interface MachineSection {
  kind: 'text' | 'gallery';
  title: { zh: string; en: string };
  desc?: { zh: string; en: string };
  items: { zh: string; en: string; image?: string }[];
}

export interface Machine {
  id: string;
  model: string;
  category: string;
  name: {
    zh: string;
    en: string;
  };
  image: string;
  /** Gallery in display order, cover first; absent in the original hand-maintained JSON. */
  images?: string[];
  video?: MachineVideo;
  /** Set on data published from the admin; absent in the original hand-maintained JSON. */
  featured?: boolean;
  sections?: MachineSection[];
  params: MachineParam[];
  source?: {
    page: number;
    extra_pages?: number[];
  };
  notes?: string;
}

export interface Category {
  id: string;
  name: {
    zh: string;
    en: string;
  };
  count: number;
}

export interface SiteInfo {
  name: {
    zh: string;
    en: string;
  };
  tagline: {
    zh: string;
    en: string;
  };
  factoryPitch: {
    zh: string;
    en: string;
  };
  certPitch: {
    zh: string;
    en: string;
  };
  address: {
    zh: string;
    en: string;
  };
  contact: {
    phone: string;
    email: string;
    whatsapp: string;
    wechat: string;
  };
  formEndpoint: string;
  /** Large picture on the About page; '' hides it. */
  aboutImage: string;
  /** WeChat QR code on the Contact page; '' shows a placeholder. */
  wechatQr: string;
  factoryPhotos: FactoryPhoto[];
  certificates: Certificate[];
  /** Analytics beacon URL; '' disables tracking (local dev, preview builds). */
  trackEndpoint: string;
}

export interface FactoryPhoto {
  image: string;
  title: { zh: string; en: string };
  desc: { zh: string; en: string };
}

export interface Certificate {
  image: string;
  title: { zh: string; en: string };
  type: string;
}
