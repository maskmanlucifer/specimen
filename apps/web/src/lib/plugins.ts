import { useEffect, useState } from 'react';
import type { PluginBundle } from '@specimen/schema';
import { api } from './api';

const cache = new Map<string, Promise<PluginBundle | null>>();

/** Loads a plugin bundle once per page load. */
export function loadPlugin(id: string): Promise<PluginBundle | null> {
  if (!cache.has(id)) cache.set(id, api.plugin(id).catch(() => null));
  return cache.get(id)!;
}

/** Drops a cached bundle after the plugin editor saves a new version. */
export function invalidatePlugin(id: string) {
  cache.delete(id);
}

/** Bundles for a set of plugin ids, keyed by id. Missing plugins are left out. */
export function usePluginBundles(ids: string[]): Record<string, PluginBundle> {
  const [bundles, setBundles] = useState<Record<string, PluginBundle>>({});
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    let live = true;
    Promise.all(key.split(',').filter(Boolean).map(async (id) => [id, await loadPlugin(id)] as const)).then((pairs) => {
      if (live) setBundles(Object.fromEntries(pairs.filter(([, b]) => b)) as Record<string, PluginBundle>);
    });
    return () => {
      live = false;
    };
  }, [key]);
  return bundles;
}
