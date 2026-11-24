import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CARD_LABEL, formatBytes, sampleBoards, STORAGE_NAME, type ActivityItem, type BoardSummary, type CardType, type StorageInfo, type Visibility } from '@specimen/schema';
import { AppHeader } from '../components/AppHeader';
import { BoardThumb } from '../components/BoardThumb';
import { IsoTray } from '../components/Iso';
import { Palette, usePaletteShortcut, type PaletteItem } from '../components/Palette';
import { Button, Dialog, Field, Icon, Input, Kbd, Label, Meter, StatusDot, StorageBadge, VisibilityPill, Working } from '../components/ui';
import { api } from '../lib/api';
import { ago, cx, editedAgo } from '../lib/format';
import { offline, type PendingBoard } from '../lib/offline';
import { ADDABLE } from '../editor/Toolbar';
import { toast } from '../store/toast';
import './dashboard.css';

type Filter = 'all' | Visibility;
type Density = 'comfortable' | 'compact' | 'list';

const DENSITY_KEY = 'specimen-dash-view';

function readDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    return v === 'compact' || v === 'list' ? v : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

function SyncStatus({ storage, pending }: { storage?: StorageInfo; pending?: PendingBoard }) {
  if (storage?.status === 'reconnect') return <StatusDot tone="danger">Reconnect needed</StatusDot>;
  if (storage?.status === 'disconnected') return <StatusDot tone="danger">Disconnected</StatusDot>;
  if (pending) return <StatusDot tone="muted">Offline · {pending.changes} queued</StatusDot>;
  return <StatusDot tone="ok">Saved</StatusDot>;
}

/** Thin stacked bar of a board's card types, in type colours (hover a segment for the count). */
function TypeBar({ board }: { board: BoardSummary }) {
  const counts = new Map<string, number>();
  for (const c of board.thumb.cards) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  const total = board.thumb.cards.length;
  if (!total) return <span className="typebar typebar--empty" />;
  return (
    <span className="typebar" aria-label={[...counts].map(([t, n]) => `${n} ${t}`).join(', ')}>
      {ADDABLE.filter((t) => counts.has(t)).map((t) => (
        <i key={t} style={{ flexGrow: counts.get(t), background: `var(--t-${t})` }} title={`${counts.get(t)} ${CARD_LABEL[t as CardType].toLowerCase()}`} />
      ))}
    </span>
  );
}

/** Activity text with long paths and URLs shortened to what a person recognises. */
function tidy(text: string): string {
  return text
    .replace(/file:\/\/\S*\/([^/\s]+)\/index\.html/g, '…/$1/')
    .replace(/https?:\/\/([^/\s]+)(\/\S*)?/g, (_m, host: string, path = '') => host.replace(/^www\./, '') + (path.length > 24 ? `${path.slice(0, 22)}…` : path));
}

/** Colour of an activity's timeline dot, by what happened. */
function activityTone(what: string): string {
  if (/^Published/.test(what)) return 'var(--hot)';
  if (/^Created|^Imported/.test(what)) return 'var(--accent)';
  if (/^Connected/.test(what)) return 'var(--ok)';
  if (/plugin/i.test(what)) return 'var(--t-math)';
  return 'var(--faint)';
}

/** Full "New board" dialog: title, storage and an optional example to start from. */
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
      setBusy(false);
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
            {busy ? <Working label="Creating" /> : 'Create board'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Quick start (after the "response bar" pattern): type a topic, press Enter, land on the new
 * board in the default storage. The options button opens the full dialog.
 */
function StartComposer({ inputRef, onOptions }: { inputRef: React.RefObject<HTMLInputElement>; onOptions: (title: string) => void }) {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const { storageId, board } = await api.createBoard(title.trim());
      nav(`/b/${storageId}/${board.slug}`);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <form
      className={cx('start', title && 'has-text')}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Icon name="plus" size={16} />
      <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Start a board — what are you researching?" aria-label="New board title" />
      {busy ? <Working label="Creating" /> : title ? <Kbd>↵</Kbd> : null}
      <button type="button" className="start-more" onClick={() => onOptions(title)} title="More options: storage and examples" aria-label="More options">
        <Icon name="settings" size={15} />
      </button>
    </form>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [storages, setStorages] = useState<StorageInfo[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [pending, setPending] = useState<PendingBoard[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [density, setDensity] = useState<Density>(readDensity);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [palette, setPalette] = useState(false);
  const [hits, setHits] = useState<PaletteItem[]>([]);
  const startRef = useRef<HTMLInputElement>(null);
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
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
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
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* private mode: the choice lasts for this tab */
    }
  }, [density]);

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
  /** Deletes the whole board folder: board.json, media/ and any share-link copies in published/. */
  const remove = async (e: React.MouseEvent, b: BoardSummary) => {
    e.preventDefault();
    e.stopPropagation();
    const where = storageOf.get(b.storageId)?.name ?? 'its storage';
    if (!confirm(`Delete “${b.title}”? This deletes the board and all its media from ${where}, and stops its share link. This cannot be undone.`)) return;
    try {
      await api.deleteBoard(b.storageId, b.slug);
      await offline.clear(b.storageId, b.slug);
      toast(`Deleted “${b.title}”`);
      await load();
    } catch (err) {
      toast((err as Error).message);
    }
  };
  const deleteButton = (b: BoardSummary) => (
    <button type="button" className="bcard-del" onClick={(e) => remove(e, b)} title="Delete board" aria-label={`Delete ${b.title}`}>
      <Icon name="trash" size={14} />
    </button>
  );
  const boardItems: PaletteItem[] = (boards ?? []).map((b) => ({ id: `board:${b.storageId}/${b.slug}`, label: b.title, icon: 'Board', hint: `${b.cards} cards`, run: () => open(b) }));
  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Drafts' },
    { value: 'unlisted', label: 'Unlisted' },
  ];

  return (
    <div className="dash">
      <AppHeader onSearch={() => setPalette(true)} />
      <div className="dash-page">
        <main>
          <header className="dash-head">
            <div>
              <h1 className="display dash-title">
                Your <em>boards</em>
              </h1>
              <p className="mono dash-sub">
                {counts.all} board{counts.all === 1 ? '' : 's'} · stored across {places} place{places === 1 ? '' : 's'} you own
              </p>
            </div>
            <StartComposer inputRef={startRef} onOptions={(t) => (setNewTitle(t), setNewOpen(true))} />
          </header>

          <div className="dash-bar" role="toolbar" aria-label="Filter and layout">
            <div className="dash-chips">
              {FILTERS.map((f) => (
                <button key={f.value} type="button" className={cx('dash-chip', filter === f.value && 'is-on')} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                  {f.label}
                  <span className="dash-count mono">{counts[f.value]}</span>
                </button>
              ))}
            </div>
            <div className="dash-density" role="group" aria-label="Layout">
              {(
                [
                  ['comfortable', 'grid', 'Comfortable grid'],
                  ['compact', 'grid', 'Compact grid'],
                  ['list', 'list', 'List'],
                ] as const
              ).map(([d, icon, label]) => (
                <button key={d} type="button" className={cx('dash-dbtn', density === d && 'is-on')} aria-pressed={density === d} title={label} aria-label={label} onClick={() => setDensity(d)}>
                  <Icon name={icon} size={d === 'compact' ? 12 : 15} />
                </button>
              ))}
            </div>
          </div>

          {boards === null ? (
            <p className="muted">Loading boards…</p>
          ) : boards.length === 0 ? (
            <div className="dash-empty">
              <div className="dash-empty-art">
                <IsoTray />
              </div>
              <h2 className="display">
                Nothing on the <em>shelf</em> yet
              </h2>
              <p className="read">Start a board above, paste a link anywhere on this page, or open an example to see a finished one.</p>
              <div className="dash-empty-actions">
                {sampleBoards.map((s) => (
                  <Button key={s.slug} onClick={() => api.createBoard(s.title, undefined, s.slug).then((r) => nav(`/b/${r.storageId}/${r.board.slug}`))}>
                    Example: {s.title}
                  </Button>
                ))}
              </div>
            </div>
          ) : density === 'list' ? (
            <div className="dash-list">
              <div className="dash-row dash-row--head">
                {['Board', 'Contents', 'Storage', 'Sync', 'Visibility', 'Edited'].map((h) => (
                  <Label key={h}>{h}</Label>
                ))}
              </div>
              {shown.map((b, i) => (
                <Link key={`${b.storageId}/${b.slug}`} to={`/b/${b.storageId}/${b.slug}`} className="dash-row">
                  <span className="dash-row-board">
                    <span className="dash-row-thumb">
                      <BoardThumb thumb={b.thumb} seed={i} />
                    </span>
                    <strong>{b.title}</strong>
                  </span>
                  <span className="dash-row-types">
                    <TypeBar board={b} />
                    <span className="mono muted">{b.cards}</span>
                  </span>
                  <span className="bcard-store">
                    {storageOf.get(b.storageId) && <StorageBadge kind={storageOf.get(b.storageId)!.kind} />}
                    {storageOf.get(b.storageId)?.name}
                  </span>
                  <SyncStatus storage={storageOf.get(b.storageId)} pending={pendingOf(b)} />
                  <VisibilityPill v={b.visibility} />
                  <span className="dash-row-edited">
                    <span className="mono muted">{ago(b.updatedAt)}</span>
                    {deleteButton(b)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className={cx('dash-grid', density === 'compact' && 'is-compact')}>
              {shown.map((b, i) => (
                <Link key={`${b.storageId}/${b.slug}`} to={`/b/${b.storageId}/${b.slug}`} className="bcard">
                  <div className="bcard-thumb">
                    <BoardThumb thumb={b.thumb} seed={i} />
                    {deleteButton(b)}
                    <span className="bcard-open mono">
                      Open <Icon name="right" size={12} />
                    </span>
                  </div>
                  <div className="bcard-body">
                    <div className="bcard-row">
                      <h3>{b.title}</h3>
                      <VisibilityPill v={b.visibility} />
                    </div>
                    <p className="mono bcard-meta">
                      {b.cards} cards · {editedAgo(b.updatedAt)}
                    </p>
                    <TypeBar board={b} />
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
              {filter === 'all' && (
                <button type="button" className="bcard bcard-new" onClick={() => startRef.current?.focus()}>
                  <span className="bcard-new-art">
                    <IsoTray callouts={false} />
                  </span>
                  <span className="bcard-new-title">Start a new board</span>
                  <span className="mono">type a topic above, or paste a link anywhere</span>
                </button>
              )}
            </div>
          )}
        </main>

        <aside className="dash-side">
          <section>
            <Label>Recent activity</Label>
            <ol className="tl">
              {activity.length === 0 && <li className="muted">Nothing yet.</li>}
              {activity.map((a, i) => (
                <li key={i}>
                  <i style={{ background: activityTone(a.what) }} />
                  <div>
                    <span className="tl-what">{tidy(a.what)}</span>
                    <span className="tl-board">{a.board}</span>
                  </div>
                  <span className="mono tl-when">{ago(a.at)}</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <Label>Where your files live</Label>
            <ul className="places">
              {storages.map((s) => (
                <li key={s.id}>
                  <div className="places-row">
                    <StorageBadge kind={s.kind} />
                    <span className="places-name">{s.name}</span>
                    {s.status === 'ok' ? (
                      <span className="mono muted">{s.usage ? `${formatBytes(s.usage.used)}${s.usage.total ? ` / ${formatBytes(s.usage.total)}` : ''}` : ''}</span>
                    ) : (
                      <Link className="mono dash-reconnect" to="/settings/storage">
                        Reconnect
                      </Link>
                    )}
                  </div>
                  <Meter value={s.usage?.total ? Math.max(0.015, s.usage.used / s.usage.total) : 0} tone={s.status === 'ok' ? 'accent' : 'danger'} />
                </li>
              ))}
            </ul>
            <p className="dash-note">There is no Specimen server. Boards are plain JSON and media files in these places.</p>
            {storages.length === 1 && storages[0].kind === 'local' && (
              <div className="dash-local">
                <p>
                  <Icon name="alert" size={14} />
                  <span>Boards in this browser are lost if site data is cleared. Keep a backup, or move them to your Google Drive.</span>
                </p>
                <div className="dash-local-actions">
                  <Button size="sm" icon="upload" onClick={() => api.exportBrowser().then(() => toast('Backup downloaded'))}>
                    Export all
                  </Button>
                  <Link className="ui-btn ui-btn--secondary ui-btn--sm" to="/signin">
                    <Icon name="cloud" size={14} /> Use Google Drive
                  </Link>
                </div>
              </div>
            )}
          </section>
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
