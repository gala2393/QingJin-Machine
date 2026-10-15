import { isDeepStrictEqual } from 'node:util';

/** Field-level changes between two flat records, for audit logs: `{ field: [before, after] }`. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: T, fields: (keyof T)[]) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const f of fields) {
    if (!isDeepStrictEqual(before[f], after[f])) out[f as string] = [before[f] ?? null, after[f] ?? null];
  }
  return out;
}

/** Keyed-list changes (e.g. params by key): which keys were added, removed or edited, and whether the order moved. */
export function diffKeyed<T>(before: T[], after: T[], keyOf: (x: T) => string) {
  const b = new Map(before.map((x) => [keyOf(x), x]));
  const a = new Map(after.map((x) => [keyOf(x), x]));
  const added = [...a.keys()].filter((k) => !b.has(k));
  const removed = [...b.keys()].filter((k) => !a.has(k));
  const changed = [...a.keys()].filter((k) => b.has(k) && !isDeepStrictEqual(a.get(k), b.get(k)));
  const common = (keys: string[], other: Map<string, T>) => keys.filter((k) => other.has(k));
  const reordered = !isDeepStrictEqual(common([...b.keys()], a), common([...a.keys()], b));
  if (!added.length && !removed.length && !changed.length && !reordered) return null;
  return { added, removed, changed, reordered };
}
