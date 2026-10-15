/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare global {
  interface Window {
    showQjToast?: (message: string, isError?: boolean) => void;
    /** Analytics beacon, defined only when tracking is enabled (see Analytics.astro). */
    qjTrack?: (type: string, data?: Record<string, unknown>) => void;
  }
}

export {};
