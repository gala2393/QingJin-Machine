export const mediaUrl = (path: string) => `/uploads/${path}`;

/** Must match the showcase site's ModelSearch `compact()` so both searches agree. */
export const compactModel = (s: string) => s.toLowerCase().replace(/[\s\-_·.]/g, '');
