import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatBytes, sampleBoards, STORAGE_NAME, type ActivityItem, type BoardSummary, type StorageInfo, type Visibility } from '@specimen/schema';
import { AppHeader } from '../components/AppHeader';
import { BoardThumb } from '../components/BoardThumb';
import { Palette, usePaletteShortcut, type PaletteItem } from '../components/Palette';
import { Button, Dialog, Field, Icon, Input, Label, Meter, Segmented, StatusDot, StorageBadge, VisibilityPill } from '../components/ui';
import { api } from '../lib/api';
import { ago, editedAgo } from '../lib/format';
import { offline, type PendingBoard } from '../lib/offline';
import { toast } from '../store/toast';
import './dashboard.css';

type Filter = 'all' | Visibility;

function SyncStatus({ storage, pending }: { storage?: StorageInfo; pending?: PendingBoard }) {
  if (storage?.status === 'reconnect') return <StatusDot tone="danger">Reconnect needed</StatusDot>;
  if (storage?.status === 'disconnected') return <StatusDot tone="danger">Disconnected</StatusDot>;
  if (pending) return <StatusDot tone="muted">Offline · {pending.changes} change{pending.changes === 1 ? '' : 's'} queued</StatusDot>;
  return <StatusDot tone="ok">Saved</StatusDot>;
}

/** "New board" dialog: title, where it lives, and an optional example to start from. */
function NewBoardDialog({ open, onClose, storages, initialTitle = '' }: { open: boolean; onClose: () => void; storages: StorageInfo[]; initialTitle?: string }) {
  const nav = useNavigate();
  const [title, setTitle] = useState(initialTitle);
  const [sid, setSid] = useState('');
  const [template, setTemplate] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setSid(storages.find((s) => s.isDefault)?.id ?? storages[0]?.id ?? '');
    }
  }, [open, initialTitle, storages]);
  const st = storages.find((s) => s.id === sid);

  const create = async () => {
    setBusy(true);
    try {
      const { storageId, board } = await api.createBoard(title || 'Untitled board', sid, template || undefined);
      nav(`/b/${storageId}/${board.slug}`);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} label="New board" width={480}>
      <form
        className="nb"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <h2 className="display nb-title">
          Start a new <em>board</em>
        </h2>
        <Field label="What are you researching?">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="How Shazam works" />
        </Field>
        <Field label="Saves to">
          <select className="ui-input" value={sid} onChange={(e) => setSid(e.target.value)}>
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} › {s.root}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start from">
          <select className="ui-input" value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">Empty board</option>
            {sampleBoards.map((b) => (
              <option key={b.slug} value={b.slug}>
                Example: {b.title}
              </option>
            ))}
          </select>
        </Field>
        <p className="mono nb-path">{st ? `${STORAGE_NAME[st.kind]} › ${st.root}/${(title || 'untitled-board').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/` : ''}</p>
        <div className="nb-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !sid}>
            Create board
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [storages, setStorages] = useState<StorageInfo[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [pending, setPending] = useState<PendingBoard[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('specimen-dash-view') as 'grid' | 'list') ?? 'grid');
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [palette, setPalette] = useState(false);
  const [hits, setHits] = useState<PaletteItem[]>([]);
  usePaletteShortcut(setPalette);

  const load = useCallback(async () => {
    const [b, s, a, p] = await Promise.all([api.boards(), api.storages(true), api.activity(), offline.all()]);
    setBoards(b.boards);
    setStorages(s);
    setActivity(a);
    setPending(p);
  }, []);
  useEffect(() => {
    load().catch((e) => toast((e as Error).message));
  }, [load]);

  // "or paste a link anywhere on this page": a pasted URL starts a board titled after the link.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const text = e.clipboardData?.getData('text/plain')?.trim() ?? '';
      if (!/^https?:\/\/\S+$/.test(text)) return;
      e.preventDefault();
      api
        .unfurl(text)
        .then((u) => setNewTitle(u.title ?? u.site))
        .catch(() => setNewTitle(new URL(text).hostname))
        .finally(() => setNewOpen(true));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    localStorage.setItem('specimen-dash-view', view);
  }, [view]);

  const storageOf = useMemo(() => new Map(storages.map((s) => [s.id, s])), [storages]);
  const pendingOf = (b: BoardSummary) => pending.find((p) => p.storageId === b.storageId && p.board.slug === b.slug);
  const counts = useMemo(() => {
    const c = { all: 0, published: 0, draft: 0, unlisted: 0 };
    for (const b of boards ?? []) {
      c.all++;
      c[b.visibility]++;
    }
    return c;
  }, [boards]);
  const shown = (boards ?? []).filter((b) => filter === 'all' || b.visibility === filter);
  const places = new Set((boards ?? []).map((b) => b.storageId)).size;
  const open = (b: BoardSummary) => nav(`/b/${b.storageId}/${b.slug}`);

  const boardItems: PaletteItem[] = (boards ?? []).map((b) => ({ id: `board:${b.storageId}/${b.slug}`, label: b.title, icon: 'Board', hint: `${b.cards} cards`, run: () => open(b) }));

  return (
    <div className="dash">
      <AppHeader onSearch={() => setPalette(true)} />
      <div className="page dash-page">
        <main>
          <div className="dash-head">
            <div>
              <h1 className="display dash-title">
                Your <em>boards</em>
              </h1>
              <p className="mono dash-sub">
                {counts.all} board{counts.all === 1 ? '' : 's'} · stored across {places} place{places === 1 ? '' : 's'} you own
              </p>
            </div>
            <div className="dash-tools">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: `All ${counts.all}` },
                  { value: 'published', label: `Published ${counts.published}` },
                  { value: 'draft', label: `Drafts ${counts.draft}` },
                  { value: 'unlisted', label: `Unlisted ${counts.unlisted}` },
                ]}
              />
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'grid', label: <Icon name="grid" title="Grid" /> },
                  { value: 'list', label: <Icon name="list" title="List" /> },
                ]}
              />
              <Button variant="primary" icon="plus" onClick={() => (setNewTitle(''), setNewOpen(true))}>
                New board
              </Button>
            </div>
          </div>

          {boards === null ? (
            <p className="muted">Loading boards…</p>
          ) : view === 'grid' ? (
            <div className="dash-grid">
              {shown.map((b, i) => (
                <Link key={`${b.storageId}/${b.slug}`} to={`/b/${b.storageId}/${b.slug}`} className="bcard">
                  <div className="bcard-thumb">
                    <BoardThumb thumb={b.thumb} seed={i} />
                  </div>
                  <div className="bcard-body">
                    <div className="bcard-row">
                      <h3>{b.title}</h3>
                      <VisibilityPill v={b.visibility} />
                    </div>
                    <p className="mono bcard-meta">
                      {b.cards} cards · {editedAgo(b.updatedAt)}
                    </p>
                    <div className="bcard-row bcard-foot">
                      <span className="bcard-store">
                        {storageOf.get(b.storageId) && <StorageBadge kind={storageOf.get(b.storageId)!.kind} />}
                        {storageOf.get(b.storageId)?.name}
                      </span>
                      <SyncStatus storage={storageOf.get(b.storageId)} pending={pendingOf(b)} />
                    </div>
                  </div>
                </Link>
              ))}
              <button type="button" className="bcard bcard-new" onClick={() => (setNewTitle(''), setNewOpen(true))}>
                <Icon name="plus" size={20} />
                <span className="serif">Start a new board</span>
                <span className="mono">or paste a link anywhere on this page</span>
              </button>
            </div>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  {['Board', 'Cards', 'Storage', 'Sync', 'Visibility', 'Edited'].map((h) => (
                    <th key={h}>
                      <Label>{h}</Label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((b, i) => (
                  <tr key={`${b.storageId}/${b.slug}`} onClick={() => open(b)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(b)}>
                    <td>
                      <span className="dash-table-board">
                        <span className="dash-table-thumb">
                          <BoardThumb thumb={b.thumb} seed={i} />
                        </span>
                        <span className="serif">{b.title}</span>
                      </span>
                    </td>
                    <td className="mono">{b.cards}</td>
                    <td>
                      <span className="bcard-store">
                        {storageOf.get(b.storageId) && <StorageBadge kind={storageOf.get(b.storageId)!.kind} />}
                        {storageOf.get(b.storageId)?.name}
                      </span>
                    </td>
                    <td>
                      <SyncStatus storage={storageOf.get(b.storageId)} pending={pendingOf(b)} />
                    </td>
                    <td>
                      <VisibilityPill v={b.visibility} />
                    </td>
                    <td className="mono muted">{ago(b.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {boards?.length === 0 && (
            <div className="dash-empty">
              <p className="serif">No boards yet. Start one, or open an example to see how a finished board looks.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {sampleBoards.map((s) => (
                  <Button key={s.slug} onClick={() => api.createBoard(s.title, undefined, s.slug).then((r) => nav(`/b/${r.storageId}/${r.board.slug}`))}>
                    Open example: {s.title}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </main>

        <aside className="dash-side">
          <Label>Recent activity</Label>
          <ul className="dash-activity">
            {activity.length === 0 && <li className="muted">Nothing yet.</li>}
            {activity.map((a, i) => (
              <li key={i}>
                <span className="mono">{ago(a.at)}</span>
                <span>
                  {a.what}
                  <em className="serif">{a.board}</em>
                </span>
              </li>
            ))}
          </ul>
          <Label>Where your files live</Label>
          <ul className="dash-places">
            {storages.map((s) => (
              <li key={s.id}>
                <div className="dash-place-row">
                  <StorageBadge kind={s.kind} />
                  <span>{s.name}</span>
                  {s.status === 'ok' ? (
                    <span className="mono muted">{s.usage ? `${formatBytes(s.usage.used)}${s.usage.total ? ` of ${formatBytes(s.usage.total)}` : ' · no quota'}` : ''}</span>
                  ) : (
                    <Link className="mono dash-reconnect" to="/settings/storage">
                      Reconnect
                    </Link>
                  )}
                </div>
                <Meter value={s.usage?.total ? s.usage.used / s.usage.total : 0} tone={s.status === 'ok' ? 'ink' : 'danger'} />
              </li>
            ))}
          </ul>
          <p className="dash-note">Specimen keeps no copies. Boards are plain JSON and media files in these folders.</p>
        </aside>
      </div>

      <NewBoardDialog open={newOpen} onClose={() => setNewOpen(false)} storages={storages} initialTitle={newTitle} />
      <Palette
        open={palette}
        onClose={() => setPalette(false)}
        placeholder="Search boards, cards, transcripts"
        groups={[
          { heading: 'Results', items: hits },
          { heading: 'Boards', items: boardItems },
          {
            heading: 'Go to',
            items: [
              { id: 'go:new', label: 'New board', icon: '+', run: () => setNewOpen(true) },
              { id: 'go:plugins', label: 'Plugins', icon: '→', run: () => nav('/plugins') },
              { id: 'go:settings', label: 'Settings', icon: '→', run: () => nav('/settings') },
            ],
          },
        ]}
        onQuery={(q) => {
          if (q.length < 2) return setHits([]);
          api
            .search(q)
            .then((r) => setHits(r.filter((h) => h.cardId).map((h, i) => ({ id: `hit:${i}:${h.cardId}`, label: h.text, icon: h.label, hint: h.board, keywords: [q], run: () => nav(`/b/${h.storageId}/${h.slug}?card=${h.cardId}`) }))))
            .catch(() => setHits([]));
        }}
        fallbackLabel={(q) => `No match. Press ↵ to start a board “${q}”.`}
        onFallback={(q) => (setNewTitle(q), setNewOpen(true))}
      />
    </div>
  );
}
