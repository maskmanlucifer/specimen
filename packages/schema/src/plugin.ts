import { z } from 'zod';

/**
 * One setting a plugin adds to the card side panel. The panel form is generated from this list,
 * so plugins never ship their own settings UI.
 */
export const PluginSetting = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select'), key: z.string(), label: z.string(), options: z.array(z.union([z.string(), z.number()])), default: z.union([z.string(), z.number()]).optional() }),
  z.object({ type: z.literal('range'), key: z.string(), label: z.string(), min: z.number(), max: z.number(), step: z.number().default(1), unit: z.string().optional(), default: z.number().optional() }),
  z.object({ type: z.literal('boolean'), key: z.string(), label: z.string(), default: z.boolean().optional() }),
  z.object({ type: z.literal('text'), key: z.string(), label: z.string(), multiline: z.boolean().default(false), default: z.string().optional() }),
]);
export type PluginSetting = z.infer<typeof PluginSetting>;

/** A card the plugin reads, e.g. an audio card for a spectrogram. */
export const PluginInput = z.object({
  key: z.string(),
  label: z.string(),
  accepts: z.array(z.string()),
});
export type PluginInput = z.infer<typeof PluginInput>;

/**
 * Plugins ask for nothing by default. `read-inputs` lets the host pass linked card data in;
 * there is no network permission because the sandbox CSP blocks all requests.
 */
export const PluginPermission = z.enum(['read-inputs']);

export const PluginCategory = z.enum(['figures', 'audio', 'data', 'math']);

/** `plugin.json` at the root of a plugin folder. */
export const PluginManifest = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  long: z.string().optional(),
  author: z.string(),
  license: z.string().default('MIT'),
  category: PluginCategory,
  permissions: z.array(PluginPermission).default([]),
  inputs: z.array(PluginInput).default([]),
  settings: z.array(PluginSetting).default([]),
  /** True when the figure has steps (◀ PREV / ▶ PLAY / NEXT ▶). */
  stepped: z.boolean().default(false),
  /** Default figure height in px. */
  height: z.number().default(260),
});
export type PluginManifest = z.infer<typeof PluginManifest>;

/** A full plugin: manifest plus source files. This is what the host loads into the sandbox. */
export interface PluginBundle {
  manifest: PluginManifest;
  /** Contents of `figure.js`. */
  script: string;
  /** Contents of `style.css` (optional). */
  style: string;
  readme?: string;
}

/** Fills missing setting values with their declared defaults. */
export function settingsWithDefaults(manifest: PluginManifest, settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of manifest.settings) out[s.key] = settings[s.key] ?? s.default;
  return { ...settings, ...out };
}
