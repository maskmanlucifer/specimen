import { renderToString } from 'react-dom/server';
import type { Board, PluginBundle } from '@specimen/schema';
import { Story } from './Story';
import { StoryEnvContext } from './StoryContext';

/**
 * Renders the story to HTML on the server, so published pages read without JavaScript
 * and search engines see the text. `reader.js` hydrates the same markup in the browser.
 */
export function renderStoryHtml(board: Board, plugins: Record<string, PluginBundle>): string {
  return renderToString(
    <StoryEnvContext.Provider value={{ mediaUrl: (p) => p, plugins, theme: 'light' }}>
      <Story board={board} />
    </StoryEnvContext.Provider>,
  );
}
