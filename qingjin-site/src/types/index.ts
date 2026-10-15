export type Lang = 'zh' | 'en';

export interface MachineParam {
  key: string;
  zh: string;
  en: string;
  value_zh: string;
  value_en: string;
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
  /** Set on data published from the admin; absent in the original hand-maintained JSON. */
  featured?: boolean;
  params: MachineParam[];
  source?: {
    half: number;
    slot: number;
    page: number;
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
