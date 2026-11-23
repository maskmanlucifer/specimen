import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CARD_LABEL, cardText, type Card, type CardType, type InstalledPlugin } from '@specimen/schema';
import { StoryEnvContext } from '@specimen/story';
import { Palette, usePaletteShortcut, type PaletteGroup, type PaletteItem } from '../components/Palette';
import { Button, Icon, Label, Spinner, TypeMark } from '../components/ui';
import { api } from '../lib/api';
import { usePluginBundles } from '../lib/plugins';
import { useTheme } from '../lib/theme';
import { Canvas, useFocusCard, ZoomControl } from '../editor/Canvas';
import { BoardBar, ConflictDialog, Recorder, SyncBanner, UploadsTray } from '../editor/Chrome';
import { ADDABLE, Toolbar } from '../editor/Toolbar';
import { useTools } from '../store/tools';
import { LogView } from '../editor/LogView';
import { SidePanel } from '../editor/panel/SidePanel';
import { PublishDialog } from '../editor/PublishDialog';
import { useCapture } from '../editor/useCapture';
import { useBoard, type NewCard } from '../store/board';
import '../editor/editor.css';

/** Default content for a card added from the toolbar or ⌘K. */
function blank(type: CardType): NewCard | null {
  switch (type) {
    case 'note':
    case 'question':
      return { type, text: '', x: 0, y: 0 };
    case 'fact':
      return { type, text: '', verified: false, x: 0, y: 0 };
    case 'quote':
      return { type, text: '', x: 0, y: 0 };
    case 'code':
      return { type, lang: 'python', code: '# code', highlight: [], x: 0, y: 0, w: 300 };
    case 'math':
      return { type, tex: 'E = mc^2', x: 0, y: 0 };
    default:
      return null;
  }
}

/** Converts a text card to another text type (⌘⇧V "wrong type?"). */
function convert(card: Card, to: CardType): Partial<Card> | null {
  const text = cardText(card);
  if (to === 'note' || to === 'question' || to === 'quote') return { type: to, text } as Partial<Card>;
  if (to === 'fact') return { type: 'fact', text, verified: false } as Partial<Card>;
  if (to === 'code') return { type: 'code', code: text, lang: 'text', highlight: [] } as Partial<Card>;
  if (to === 'math') return { type: 'math', tex: text.replace(/^\$+|\$+$/g, '') } as Partial<Card>;
  return null;
}

function Editor() {
  const { sid = '', slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const board = useBoard((s) => s.board);
  const loadError = useBoard((s) => s.loadError);
  const sync = useBoard((s) => s.sync);
  const selection = useBoard((s) => s.selection);
  const { theme } = useTheme();
  const rf = useReactFlow();
  const focusCard = useFocusCard();
  const capture = useCapture();
  const setTool = useTools((s) => s.setTool);
  const setComposing = useTools((s) => s.setComposing);
  const [panel, setPanel] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [figurePick, setFigurePick] = useState(false);
  const [recording, setRecording] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const view = params.get('view') === 'log' ? 'log' : 'canvas';
  usePaletteShortcut(setPalette);

  useEffect(() => {
    useBoard.getState().load(sid, slug);
    api.plugins().then(setInstalled).catch(() => undefined);
    return () => {
      useBoard.getState().flush();
    };
  }, [sid, slug]);

  // Save before the tab closes; IndexedDB already holds the edits if this does not finish.
  useEffect(() => {
    const onHide = () => useBoard.getState().flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // Open the panel for a single selected card; close it when the selection is cleared.
  useEffect(() => {
    if (selection.length === 1) setPanel(selection[0]);
    else if (selection.length === 0) setPanel(null);
  }, [selection]);

  const focusParam = params.get('card');
  useEffect(() => {
    if (board && focusParam) {
      setTimeout(() => focusCard(focusParam), 150);
      params.delete('card');
      setParams(params, { replace: true });
    }
  }, [board, focusParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const pluginIds = useMemo(() => [...new Set((board?.cards ?? []).filter((c) => c.type === 'figure').map((c) => (c as Extract<Card, { type: 'figure' }>).plugin))], [board?.cards]);
  const plugins = usePluginBundles(pluginIds);
  const env = useMemo(() => ({ mediaUrl: (p: string) => api.mediaUrl(sid, slug, p), plugins, theme }), [sid, slug, plugins, theme]);

  const center = useCallback(() => {
    const el = document.querySelector('.canvas')!.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: el.left + el.width / 2 - 120, y: el.top + el.height / 2 - 60 });
  }, [rf]);

  const add = useCallback(
    (type: CardType) => {
      if (['image', 'audio', 'video', 'document'].includes(type)) return fileInput.current?.click();
      if (type === 'figure') return setFigurePick(true);
      if (type === 'link') {
        const url = prompt('Paste a link');
        if (url) capture.addText(url, center());
        return;
      }
      const card = blank(type);
      if (card) useBoard.getState().addCard(card, center());
    },
    [capture, center],
  );

  const addFigure = (p: InstalledPlugin) => {
    const card = useBoard.getState().addCard({ type: 'figure', plugin: p.manifest.id, title: p.manifest.name, settings: {}, inputs: {}, x: 0, y: 0, w: 340 }, center());
    useBoard.getState().change((b) => void (b.plugins[p.manifest.id] ??= p.manifest.version), { history: false });
    setPanel(card.id);
  };

  // Single-key shortcuts outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], .cm-editor, [role=dialog]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const s = useBoard.getState();
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        if (capture.last.current) setConvertOpen(true);
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        s.flush();
      } else if (!mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'n') (e.preventDefault(), setComposing(true));
        else if (k === 'v') setTool('select');
        else if (k === 'c') setTool('connect');
        else if (k === 's') setTool('section');
        else if (e.key === 'Escape') (s.select([]), setTool('select'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [add, capture]);

  if (loadError && !board) return <BoardUnavailable message={loadError} sync={sync} />;
  if (!board) return <div className="board-loading"><Spinner /></div>;

  const cardItems: PaletteItem[] = board.cards.map((c) => ({
    id: `card:${c.id}`,
    label: cardText(c).slice(0, 90) || CARD_LABEL[c.type],
    icon: CARD_LABEL[c.type],
    keywords: [cardText(c)],
    run: ({ panel: p }) => (setParams({}), setTimeout(() => (focusCard(c.id), p && setPanel(c.id)), 50)),
  }));
  const groups: PaletteGroup[] = [
    { heading: 'Add', items: ADDABLE.map((t) => ({ id: `add:${t}`, label: `Add ${CARD_LABEL[t].toLowerCase()}`, icon: <TypeMark type={t} />, hint: t === 'note' ? 'N' : undefined, run: () => (t === 'note' ? setComposing(true) : add(t)) })) },
    { heading: 'Cards', items: cardItems },
    {
      heading: 'Go to',
      items: [
        ...board.sections.map((s, i) => ({ id: `sec:${s.id}`, label: s.title, icon: `§ ${i + 1}`, run: () => rf.fitBounds({ x: s.x, y: s.y, width: s.w, height: s.h }, { padding: 0.1, duration: 400 }) })),
        { id: 'go:log', label: view === 'log' ? 'Canvas' : 'Log view', icon: '→', run: () => setParams(view === 'log' ? {} : { view: 'log' }) },
        { id: 'go:preview', label: 'Preview as reader', icon: '→', run: () => nav(`/b/${sid}/${slug}/preview`) },
        { id: 'go:publish', label: 'Publish…', icon: '→', run: () => setPublishing(true) },
        { id: 'go:record', label: 'Record audio', icon: '●', run: () => setRecording(true) },
        { id: 'go:section', label: 'New section', icon: '+', hint: 'S', run: () => useBoard.getState().addSection(center()) },
      ],
    },
  ];
  const last = board.cards.find((c) => c.id === capture.last.current);

  return (
    <StoryEnvContext.Provider value={env}>
      <div className="board-page">
        <BoardBar view={view} setView={(v) => setParams(v === 'log' ? { view: 'log' } : {})} onSearch={() => setPalette(true)} onPreview={() => nav(`/b/${sid}/${slug}/preview`)} onPublish={() => setPublishing(true)} />
        <SyncBanner />
        <div className="board-body">
          {view === 'canvas' ? (
            <>
              <Canvas capture={capture} onOpenPanel={setPanel} onEmptyHint />
              <ZoomControl />
              <Toolbar onAdd={add} onCompose={(text) => capture.addText(text, center(), 'Added')} onUpload={() => fileInput.current?.click()} onRecord={() => setRecording(true)} />
              <UploadsTray />
            </>
          ) : (
            <LogView onOpen={(id) => (setParams({}), setTimeout(() => focusCard(id), 100))} />
          )}
          {panel && view === 'canvas' && <SidePanel id={panel} onClose={() => (setPanel(null), useBoard.getState().select([]))} />}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept="image/*,audio/*,video/*,application/pdf,.md,.txt"
        onChange={(e) => {
          capture.addFiles([...(e.target.files ?? [])], center());
          e.target.value = '';
        }}
      />
      <Palette open={palette} onClose={() => setPalette(false)} groups={groups} fallbackLabel={(q) => `No match. Press ↵ to add “${q}” as a note.`} onFallback={(q) => useBoard.getState().addCard({ type: 'note', text: q, x: 0, y: 0 }, center())} />
      <Palette
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        placeholder="Change the pasted card to…"
        groups={[{ heading: 'Card type', items: (['note', 'fact', 'question', 'quote', 'code', 'math'] as CardType[]).filter((t) => t !== last?.type).map((t) => ({ id: `to:${t}`, label: CARD_LABEL[t], icon: '↺', run: () => last && useBoard.getState().updateCard(last.id, convert(last, t) ?? {}, `Changed card to ${t}`) })) }]}
      />
      <Palette
        open={figurePick}
        onClose={() => setFigurePick(false)}
        placeholder="Add a figure from a plugin"
        groups={[{ heading: 'Plugins', items: installed.map((p) => ({ id: `fig:${p.manifest.id}`, label: p.manifest.name, icon: p.manifest.category.slice(0, 4), hint: p.manifest.description, run: () => addFigure(p) })) }]}
      />
      <Recorder open={recording} onClose={() => setRecording(false)} onDone={(f) => capture.addFiles([f], center()).then(() => useBoard.getState().change(() => undefined, { history: false, log: { action: 'recorded', text: `Recorded ${f.name}` } }))} />
      {sync === 'conflict' && <ConflictDialog />}
      {publishing && <PublishDialog onClose={() => setPublishing(false)} />}
    </StoryEnvContext.Provider>
  );
}

/** Full-page states when a board cannot load: disconnected storage (4s), private (4w) or missing. */
function BoardUnavailable({ message, sync }: { message: string; sync: string }) {
  const { sid = '' } = useParams();
  const notFound = /not found/i.test(message);
  return (
    <div className="state-page">
      <div className="state-card">
        <Label tone="hot">{notFound ? '404' : sync === 'reconnect' ? 'Reconnect needed' : 'Storage disconnected'}</Label>
        <h1 className="display">{notFound ? <>This board is <em>not here</em></> : <>Storage is <em>disconnected</em></>}</h1>
        <p className="read">{notFound ? 'It may have been moved or renamed in your storage.' : `Specimen can't reach this board. ${message}. Changes you made on this device are kept.`}</p>
        <div className="state-actions">
          {!notFound && (
            <Button variant="primary" icon="refresh" onClick={() => (window.location.href = `/settings/storage#${sid}`)}>
              Reconnect
            </Button>
          )}
          <Link to="/boards" className="ui-btn ui-btn--secondary ui-btn--md">
            <Icon name="back" /> All boards
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BoardPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}

