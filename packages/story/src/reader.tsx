import { hydrateRoot } from 'react-dom/client';
import type { Board, PluginBundle } from '@specimen/schema';
import { Story } from './Story';
import { StoryEnvContext } from './StoryContext';
import './story.css';

/**
 * Entry of the static reader bundle (`reader.js`). The published `index.html` holds the
 * server-rendered story plus the board data; this hydrates it so figures become interactive.
 */
const data = JSON.parse(document.getElementById('specimen-data')!.textContent!) as { board: Board; plugins: Record<string, PluginBundle> };
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = dark ? 'dark' : 'light';

hydrateRoot(
  document.getElementById('root')!,
  <StoryEnvContext.Provider value={{ mediaUrl: (p) => p, plugins: data.plugins, theme: dark ? 'dark' : 'light' }}>
    <Story board={data.board} />
  </StoryEnvContext.Provider>,
);
