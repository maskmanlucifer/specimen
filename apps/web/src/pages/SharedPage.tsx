import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Story, StoryEnvContext, type StoryEnv } from '@specimen/story';
import type { Board } from '@specimen/schema';
import { loadShared } from '../backend';
import { Logo, Spinner } from '../components/ui';
import { useTheme } from '../lib/theme';
import './preview.css';

/**
 * A published board opened from a share link. Public: no sign-in. The board and its media are
 * public files in the author's Google Drive, read with a Google API key.
 */
export default function SharedPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { theme } = useTheme();
  const [state, setState] = useState<{ board: Board; env: StoryEnv } | { error: string } | null>(null);

  useEffect(() => {
    loadShared(id, params.get('k') ?? undefined).then(
      ({ board, plugins, mediaUrl }) => setState({ board, env: { mediaUrl, plugins, theme } }),
      (e) => setState({ error: (e as Error).message }),
    );
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <div className="board-loading"><Spinner /></div>;
  if ('error' in state)
    return (
      <div className="shared-error">
        <Logo />
        <p>{state.error}</p>
      </div>
    );
  document.title = state.board.title;
  return (
    <div className="preview">
      <StoryEnvContext.Provider value={{ ...state.env, theme }}>
        <Story board={state.board} />
      </StoryEnvContext.Provider>
      <footer className="shared-foot mono">
        Made with <Link to="/">Specimen</Link>
      </footer>
    </div>
  );
}
