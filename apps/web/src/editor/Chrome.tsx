import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CARD_LABEL, formatBytes, type Board, type Card } from '@specimen/schema';
import { Button, Dialog, Icon, Kbd, Label, Segmented, StatusDot } from '../components/ui';
import { cx, boardPlace } from '../lib/format';
import { useBoard } from '../store/board';
import { useUploads } from '../store/uploads';

/** Sync status in the top bar: "● Saved  Google Drive". */
export function SyncLabel() {
  const sync = useBoard((s) => s.sync);
  const unsynced = useBoard((s) => s.unsynced);
  const storage = useBoard((s) => s.storage);
  const all = useUploads((s) => s.uploads);
  const uploads = all.filter((u) => u.status === 'uploading');
  const where = <span className="mono sync-where">{storage?.name}</span>;
  if (sync === 'conflict') return <StatusDot tone="danger">Conflict {where}</StatusDot>;
  if (sync === 'reconnect') return <StatusDot tone="danger">Reconnect needed · {unsynced} queued</StatusDot>;
  if (sync === 'offline') return <StatusDot tone="muted">Offline · {unsynced} queued</StatusDot>;
  if (sync === 'error') return <StatusDot tone="danger">Not saved</StatusDot>;
  if (uploads.length) {
    const pct = Math.round((uploads.reduce((a, u) => a + u.received, 0) / Math.max(1, uploads.reduce((a, u) => a + u.size, 0))) * 100);
    return (
      <StatusDot tone="warn">
        Saving <span className="mono sync-where">{uploads.length} upload · {pct}%</span>
      </StatusDot>
    );
  }
  if (sync === 'saving') return <StatusDot tone="warn">Saving {where}</StatusDot>;
  return <StatusDot tone="ok">Saved {where}</StatusDot>;
}

/** Board top bar: back, title, path, Canvas/Log, sync, search, Preview, Publish. */
export function BoardBar({ view, setView, onSearch, onPreview, onPublish }: { view: 'canvas' | 'log'; setView: (v: 'canvas' | 'log') => void; onSearch: () => void; onPreview: () => void; onPublish: () => void }) {
  const board = useBoard((s) => s.board)!;
  const storage = useBoard((s) => s.storage);
  const change = useBoard((s) => s.change);
  const [editing, setEditing] = useState(false);
  return (
    <header className="bbar">
      <Link to="/boards" className="bbar-back" aria-label="Back to boards">
        <Icon name="back" />
      </Link>
      <div className="bbar-title">
        {editing ? (
          <input
            autoFocus
            defaultValue={board.title}
            onBlur={(e) => {
              setEditing(false);
              const t = e.target.value.trim();
              if (t && t !== board.title) change((b) => void (b.title = t));
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <h1 onDoubleClick={() => setEditing(true)} title="Double-click to rename">
            {board.title}
          </h1>
        )}
        <span className="mono">
          {storage?.name} › {boardPlace(storage, board.slug)}
        </span>
      </div>
      <div className="bbar-center">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'canvas', label: 'Canvas' },
            { value: 'log', label: 'Log' },
          ]}
        />
      </div>
      <div className="bbar-right">
        <SyncLabel />
        <button type="button" className="app-search bbar-search" onClick={onSearch}>
          <Icon name="search" />
          <span>Search or add</span>
          <Kbd>⌘K</Kbd>
        </button>
        <Button variant="ghost" onClick={onPreview}>
          Preview
        </Button>
        <Button variant="primary" onClick={onPublish}>
          Publish
        </Button>
      </div>
    </header>
  );
}

/** Banner for "Reconnect needed" and "Offline" (system states 4r, 4u). Work is never lost. */
export function SyncBanner() {
  const sync = useBoard((s) => s.sync);
  const unsynced = useBoard((s) => s.unsynced);
  const storage = useBoard((s) => s.storage);
  if (sync === 'reconnect')
    return (
      <div className="banner banner--danger" role="alert">
        <span>
          <strong>{storage?.name} access expired.</strong> Keep working. {unsynced} change{unsynced === 1 ? ' is' : 's are'} saved on this device and upload after you reconnect.
        </span>
        <Button size="sm" variant="primary" onClick={() => (window.location.href = `/settings/storage#${storage?.id}`)}>
          Reconnect {storage?.name}
        </Button>
      </div>
    );
  if (sync === 'offline')
    return (
      <div className="banner" role="status">
        <Icon name="offline" />
        <span>You're offline. Edits are saved on this device and sync when you're back.</span>
        <span className="mono">{unsynced} queued</span>
      </div>
    );
  return null;
}

type Choice = 'mine' | 'theirs';

/**
 * Sync conflict chooser (4t): lists cards that differ between this device and storage.
 * Click a version per card, or decide for the whole board.
 */
export function ConflictDialog() {
  const mine = useBoard((s) => s.board);
  const theirs = useBoard((s) => s.conflict);
  const resolve = useBoard((s) => s.resolveConflict);
  const storage = useBoard((s) => s.storage);
  const [picks, setPicks] = useState<Record<string, Choice>>({});
  if (!mine || !theirs) return null;

  const ids = [...new Set([...mine.cards, ...theirs.cards].map((c) => c.id))];
  const differ = ids.filter((id) => JSON.stringify(mine.cards.find((c) => c.id === id)) !== JSON.stringify(theirs.cards.find((c) => c.id === id)));
  const merged = (all?: Choice): Board => {
    const base = structuredClone(all === 'theirs' ? theirs : mine);
    if (!all) {
      base.cards = ids
        .map((id) => ((picks[id] ?? 'mine') === 'mine' ? mine : theirs).cards.find((c) => c.id === id))
        .filter((c): c is Card => !!c);
    }
    return { ...base, rev: theirs.rev };
  };
  const keepBoth = (): Board => {
    const base = structuredClone(theirs);
    for (const id of differ) {
      const m = mine.cards.find((c) => c.id === id);
      if (m) base.cards.push({ ...m, id: `${m.id}_copy`, x: m.x + 24, y: m.y + 24 } as Card);
    }
    return base;
  };
  const Version = ({ board, id, side }: { board: Board; id: string; side: Choice }) => {
    const c = board.cards.find((x) => x.id === id);
    const chosen = (picks[id] ?? 'mine') === side;
    return (
      <button type="button" className={cx('cf-ver', chosen && 'is-on')} onClick={() => setPicks({ ...picks, [id]: side })}>
        {c ? (
          <>
            <span className="sp-label">{CARD_LABEL[c.type]}</span>
            <span>{'text' in c ? c.text : 'title' in c ? c.title : c.type}</span>
            {c.source?.url && <span className="mono muted">{new URL(c.source.url).hostname}</span>}
          </>
        ) : (
          <span className="muted">Deleted</span>
        )}
      </button>
    );
  };
  return (
    <Dialog open onClose={() => undefined} label="Sync conflict" width={760}>
      <div className="cf">
        <Label tone="hot">Conflict · {storage?.name}</Label>
        <h2 className="display">
          Two versions of <em>this board</em>
        </h2>
        <p className="read">You edited here while another device saved to {storage?.name}. Nothing is lost.</p>
        <Label>
          {differ.length} card{differ.length === 1 ? '' : 's'} differ
        </Label>
        <div className="cf-grid">
          <span className="mono muted">This device</span>
          <span className="mono muted">{storage?.name}</span>
          {differ.map((id) => (
            <div key={id} className="cf-row">
              <Version board={mine} id={id} side="mine" />
              <Version board={theirs} id={id} side="theirs" />
            </div>
          ))}
        </div>
        <p className="panel-muted">Click a version to choose it for this card, or decide for the whole board below.</p>
        <div className="cf-actions">
          <Button onClick={() => resolve(merged('mine'))}>Keep all from this device</Button>
          <Button onClick={() => resolve(merged('theirs'))}>Keep all from {storage?.name}</Button>
          <Button onClick={() => resolve(keepBoth())}>Keep both as a copy</Button>
          <Button variant="primary" onClick={() => resolve(merged())}>
            Use my picks
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Upload tray (design 2a): progress per file, paused state, and the storage note. */
export function UploadsTray() {
  const uploads = useUploads((s) => s.uploads);
  const cancel = useUploads((s) => s.cancel);
  const storage = useBoard((s) => s.storage);
  if (!uploads.length) return null;
  return (
    <div className="uploads">
      <Label>Uploads</Label>
      {uploads.map((u) => (
        <div key={u.id} className="upload">
          <div className="upload-row">
            <span>{u.name}</span>
            {u.status === 'uploading' && (
              <button type="button" className="panel-x" aria-label="Cancel upload" onClick={() => cancel(u.id)}>
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
          <div className="ghost-bar">
            <i style={{ width: `${(u.received / Math.max(1, u.size)) * 100}%` }} />
          </div>
          <span className="mono muted">
            {u.status === 'done' ? `✓ Saved · ${formatBytes(u.size)}` : u.status === 'paused' ? 'Paused · offline, resumes automatically' : u.status === 'error' ? u.error : `${formatBytes(u.received)} / ${formatBytes(u.size)}`}
          </span>
        </div>
      ))}
      <p className="panel-muted">Large files upload in 8 MB chunks straight to your {storage?.name}. Closing the tab pauses them.</p>
    </div>
  );
}

/**
 * Audio recorder (design 2c): live level waveform, timer, pause, discard, and
 * "Stop and add card". Uses MediaRecorder; the file is uploaded like a dropped file.
 */
export function Recorder({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (file: File) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'error'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [device, setDevice] = useState('Microphone');
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const storage = useBoard((s) => s.storage);
  const slug = useBoard((s) => s.slug);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let started = 0;
    let pausedTotal = 0;
    let pausedAt = 0;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        stream.current = s;
        setDevice(s.getAudioTracks()[0]?.label || 'Microphone');
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const type = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
        const r = new MediaRecorder(s, { mimeType: type });
        rec.current = r;
        chunks.current = [];
        r.ondataavailable = (e) => chunks.current.push(e.data);
        r.onpause = () => (pausedAt = performance.now());
        r.onresume = () => (pausedTotal += performance.now() - pausedAt);
        r.start(1000);
        started = performance.now();
        setState('recording');
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
          if (r.state === 'recording') {
            setLevels((l) => [...l.slice(-119), peak]);
            setElapsed((performance.now() - started - pausedTotal) / 1000);
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => setState('error'));
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (rec.current?.state !== 'inactive') rec.current?.stop();
      setLevels([]);
      setElapsed(0);
      setState('idle');
    };
  }, [open]);

  const stamp = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `rec-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };
  const ext = () => (rec.current?.mimeType.includes('mp4') ? 'm4a' : 'webm');

  const stop = () => {
    const r = rec.current;
    if (!r) return;
    r.onstop = () => {
      onDone(new File(chunks.current, `${stamp()}.${ext()}`, { type: r.mimeType }));
      onClose();
    };
    r.stop();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  const cs = String(Math.floor((elapsed % 1) * 100)).padStart(2, '0');
  const togglePause = () => {
    if (rec.current?.state === 'recording') {
      rec.current.pause();
      setState('paused');
    } else if (rec.current?.state === 'paused') {
      rec.current.resume();
      setState('recording');
    }
  };
  return (
    <div className="rec-sheet" role="dialog" aria-label="Record audio">
      <div className="rec-top">
        <span className={cx('rec-dot', state === 'recording' && 'is-live')} />
        <strong>{state === 'error' ? 'Microphone blocked' : state === 'paused' ? 'Paused' : 'Listening'}</strong>
        <button type="button" className="panel-x rec-discard" aria-label="Discard recording" title="Discard" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <p className="rec-sub">{state === 'error' ? 'Allow microphone access in your browser, then try again.' : 'Speak freely. The clip becomes an audio card on this board.'}</p>
      <div className="rec-wave" aria-hidden>
        {levels.map((l, i) => (
          <i key={i} style={{ height: `${Math.max(6, l * 100)}%` }} />
        ))}
      </div>
      <div className="rec-row">
        <span className="rec-time mono">
          {mm}:{ss}
          <small>{cs}</small>
        </span>
        <button type="button" className="rec-pill" onClick={togglePause} disabled={state === 'error'} aria-label={state === 'paused' ? 'Resume' : 'Pause'}>
          <Icon name={state === 'paused' ? 'play' : 'pause'} size={13} />
        </button>
        <button type="button" className="rec-pill rec-stop" onClick={stop} disabled={state === 'error' || elapsed < 0.5}>
          <i /> Stop and add
        </button>
      </div>
      <p className="rec-meta mono">
        {device} · 48 kHz · mono → {boardPlace(storage, slug)}/media/{stamp()}.{rec.current ? ext() : 'm4a'}
      </p>
    </div>
  );
}
