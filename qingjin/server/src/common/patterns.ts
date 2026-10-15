export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PARAM_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Optional text fields: blank input is stored as NULL so "unset" has one representation. */
export const blankToNull = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};
