import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Board, Card } from '@specimen/schema';
import { Story, StoryEnvContext } from '@specimen/story';
import { Button, Icon, Label, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { usePluginBundles } from '../lib/plugins';
import { useTheme } from '../lib/theme';
import './preview.css';

/** "Preview as reader": the exact published story, from the current saved board, private cards hidden. */
export default function PreviewPage() {
  const { sid = '', slug = '' } = useParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  useEffect(() => {
    api.board(sid, slug).then((r) => setBoard(r.board), (e) => setError((e as Error).message));
  }, [sid, slug]);
  const ids = (board?.cards ?? []).filter((c): c is Extract<Card, { type: 'figure' }> => c.type === 'figure').map((c) => c.plugin);
  const plugins = usePluginBundles(ids);
  const env = useMemo(() => ({ mediaUrl: (p: string) => api.mediaUrl(sid, slug, p), plugins, theme }), [sid, slug, plugins, theme]);
  if (error) return <p className="page">{error}</p>;
  if (!board) return <div className="board-loading"><Spinner /></div>;
  const hidden = board.cards.filter((c) => c.private).length;
  return (
    <div className="preview">
      <div className="preview-bar">
        <Link to={`/b/${sid}/${slug}`} className="ui-btn ui-btn--ghost ui-btn--sm">
          <Icon name="back" size={14} /> Back to board
        </Link>
        <Label>Preview as reader{hidden ? ` · ${hidden} private card${hidden === 1 ? '' : 's'} hidden` : ''}</Label>
        <Button size="sm" variant="primary" onClick={() => history.back()}>
          Done
        </Button>
      </div>
      <StoryEnvContext.Provider value={env}>
        <Story board={{ ...board, cards: board.cards.filter((c) => !c.private) }} />
      </StoryEnvContext.Provider>
    </div>
  );
}
