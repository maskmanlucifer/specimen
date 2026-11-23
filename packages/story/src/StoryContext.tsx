import { createContext, useContext } from 'react';
import type { Board, PluginBundle } from '@specimen/schema';
import type { PluginInputData } from './plugin/runtime';

/**
 * How the reader finds things. The app points these at the API; the static export points
 * them at files next to `index.html`.
 */
export interface StoryEnv {
  /** Board-relative media path (`media/x.mp3`) → URL the browser can load. */
  mediaUrl: (path: string) => string;
  /** Plugin bundles by id, already loaded. */
  plugins: Record<string, PluginBundle>;
  theme: 'light' | 'dark';
  /** Resolves a figure's inputs (e.g. fetches the linked audio bytes). */
  loadInputs?: (board: Board, inputs: Record<string, string>) => Promise<Record<string, PluginInputData>>;
}

export const StoryEnvContext = createContext<StoryEnv>({ mediaUrl: (p) => p, plugins: {}, theme: 'light' });
export const useStoryEnv = () => useContext(StoryEnvContext);

/** Absolute URLs pass through; board-relative paths go through `mediaUrl`. */
export function useMedia() {
  const { mediaUrl } = useStoryEnv();
  return (p?: string) => (!p ? undefined : /^(https?:|data:|blob:)/.test(p) ? p : mediaUrl(p));
}

/**
 * Default input loader: fetches media bytes for audio/video inputs and passes text for the rest.
 * Works in the app and in the static export because it uses {@link StoryEnv.mediaUrl}.
 */
export async function defaultLoadInputs(board: Board, inputs: Record<string, string>, mediaUrl: (p: string) => string): Promise<Record<string, PluginInputData>> {
  const out: Record<string, PluginInputData> = {};
  await Promise.all(
    Object.entries(inputs).map(async ([key, cardId]) => {
      const card = board.cards.find((c) => c.id === cardId);
      if (!card) return;
      const data: PluginInputData = { cardType: card.type };
      if ('title' in card) data.title = card.title;
      if ('text' in card) data.text = card.text;
      if (card.type === 'code') data.text = card.code;
      if ((card.type === 'audio' || card.type === 'video') && !/^https?:\/\/(www\.)?(youtube|youtu\.be|vimeo)/.test(card.src)) {
        data.duration = card.duration;
        const res = await fetch(/^(https?:|blob:|data:)/.test(card.src) ? card.src : mediaUrl(card.src)).catch(() => null);
        if (res?.ok) data.bytes = await res.arrayBuffer();
      }
      out[key] = data;
    }),
  );
  return out;
}
