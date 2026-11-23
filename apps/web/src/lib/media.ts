import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { defaultLoadInputs, type StoryEnv } from '@specimen/story';
import type { PluginBundle } from '@specimen/schema';
import { api } from './api';

/** `blob:` URLs for media read from IndexedDB or Drive, by `sid/slug/path`. */
const cache = new Map<string, string | 'loading' | 'missing'>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const bump = () => {
  version++;
  for (const fn of listeners) fn();
};

/** Loads one media file into the cache. Resolves to its URL, or `undefined` when it is missing. */
async function load(sid: string, slug: string, path: string): Promise<string | undefined> {
  const key = `${sid}/${slug}/${path}`;
  const hit = cache.get(key);
  if (hit && hit !== 'loading') return hit === 'missing' ? undefined : hit;
  cache.set(key, 'loading');
  const blob = await api.mediaBlob(sid, slug, path).catch(() => null);
  const url = blob ? URL.createObjectURL(blob) : undefined;
  cache.set(key, url ?? 'missing');
  bump();
  return url;
}

/**
 * The story environment for a board in the app: media resolves to cached `blob:` URLs, and the
 * page re-renders when a file finishes loading.
 */
export function useBoardEnv(sid: string, slug: string, plugins: Record<string, PluginBundle>, theme: 'light' | 'dark'): StoryEnv {
  const v = useSyncExternalStore(subscribe, () => version);
  const mediaUrl = useCallback(
    (p: string) => {
      const hit = cache.get(`${sid}/${slug}/${p}`);
      if (hit === undefined) void load(sid, slug, p);
      return hit && hit !== 'loading' && hit !== 'missing' ? hit : undefined;
    },
    // `v` makes a new function (and a new env) after each load, so readers of the URL re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sid, slug, v],
  );
  return useMemo(() => ({ mediaUrl, plugins, theme, loadInputs: (b, i) => defaultLoadInputs(b, i, (p) => load(sid, slug, p)) }), [mediaUrl, plugins, theme, sid, slug]);
}
