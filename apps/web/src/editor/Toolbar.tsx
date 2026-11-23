import { useEffect, useRef, useState } from 'react';
import { CARD_LABEL, type CardType } from '@specimen/schema';
import { Icon, Kbd, TypeMark } from '../components/ui';
import { classifyText } from '../lib/capture';
import { cx } from '../lib/format';
import { LINK_PRESETS, useTools, type Tool } from '../store/tools';

/** Every card type that can be added, for ⌘K. */
export const ADDABLE: CardType[] = ['note', 'fact', 'question', 'quote', 'link', 'code', 'math', 'figure', 'image', 'audio', 'video', 'document'];

/** The Add tray: text types one by one; image, audio, video and PDF share one "File…" entry (they all open the file picker). */
const TRAY: CardType[] = ['note', 'fact', 'question', 'quote', 'link', 'code', 'math', 'figure'];

const TOOLS: { tool: Tool; icon: 'cursor' | 'connect' | 'section'; label: string; shortcut: string }[] = [
  { tool: 'select', icon: 'cursor', label: 'Select', shortcut: 'V' },
  { tool: 'connect', icon: 'connect', label: 'Connect', shortcut: 'C' },
  { tool: 'section', icon: 'section', label: 'Section', shortcut: 'S' },
];

/**
 * The composer: one line that becomes the right card (the same rules as paste).
 * A live chip shows what the text will turn into before it is added.
 */
function Composer({ onSubmit, onClose }: { onSubmit: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);
  const kind = text.trim() ? classifyText(text).type : 'note';
  const submit = () => {
    if (!text.trim()) return onClose();
    onSubmit(text);
    setText('');
  };
  return (
    <form
      className="tb-compose"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="tb-compose-kind" title="What this becomes">
        <TypeMark type={kind} />
        {CARD_LABEL[kind]}
      </span>
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
        }}
        onBlur={() => !text.trim() && onClose()}
        placeholder="Write a note, paste a link, $math$, or ask a question?"
        aria-label="New card"
      />
      <button type="submit" className="tb-send" aria-label="Add card" disabled={!text.trim()}>
        <Icon name="right" size={15} />
      </button>
    </form>
  );
}

/**
 * Floating canvas toolbar (after the "marker" pattern): the active tool lifts, and its options
 * slide out inside the same pill — card types for Add, label presets for Connect, a hint for
 * Section. N turns the whole bar into an inline composer.
 */
export function Toolbar({ onAdd, onCompose, onUpload, onRecord }: { onAdd: (t: CardType) => void; onCompose: (text: string) => void; onUpload: () => void; onRecord: () => void }) {
  const { tool, setTool, connectLabel, setConnectLabel, composing, setComposing, adding, setAdding } = useTools();
  const ref = useRef<HTMLDivElement>(null);

  // Clicking outside closes the Add tray.
  useEffect(() => {
    if (!adding) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAdding(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [adding, setAdding]);

  const tray = adding ? 'add' : tool === 'connect' ? 'connect' : tool === 'section' ? 'section' : null;

  return (
    <div ref={ref} className={cx('tb', composing && 'is-composing')} role="toolbar" aria-label="Canvas tools">
      {composing ? (
        <Composer onSubmit={onCompose} onClose={() => setComposing(false)} />
      ) : (
        <>
          {TOOLS.slice(0, 1).map((t) => (
            <ToolButton key={t.tool} icon={t.icon} label={t.label} shortcut={t.shortcut} on={tool === t.tool && !adding} onClick={() => setTool(t.tool)} />
          ))}
          <button type="button" className={cx('tb-btn', adding && 'is-on')} onClick={() => setAdding(!adding)} aria-expanded={adding} aria-label="Add card" title="Add card">
            <Icon name="plus" size={17} />
          </button>
          {TOOLS.slice(1).map((t) => (
            <ToolButton key={t.tool} icon={t.icon} label={t.label} shortcut={t.shortcut} on={tool === t.tool && !adding} onClick={() => setTool(tool === t.tool ? 'select' : t.tool)} />
          ))}
          <span className="tb-sep" />
          <button type="button" className="tb-btn" onClick={onUpload} title="Upload files" aria-label="Upload files">
            <Icon name="upload" size={17} />
          </button>
          <button type="button" className="tb-btn" onClick={onRecord} title="Record audio" aria-label="Record audio">
            <Icon name="mic" size={17} />
          </button>
          <div className={cx('tb-tray', tray && 'is-open')} aria-hidden={!tray}>
            {tray === 'add' &&
              TRAY.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="tb-chip"
                  onClick={() => {
                    setAdding(false);
                    if (t === 'note') setComposing(true);
                    else onAdd(t);
                  }}
                >
                  <TypeMark type={t} />
                  {CARD_LABEL[t]}
                  {t === 'note' && <Kbd>N</Kbd>}
                </button>
              ))}
            {tray === 'add' && (
              <button
                type="button"
                className="tb-chip"
                onClick={() => {
                  setAdding(false);
                  onUpload();
                }}
              >
                <Icon name="upload" size={12} />
                File…
              </button>
            )}
            {tray === 'connect' &&
              LINK_PRESETS.map((l) => (
                <button key={l ?? 'none'} type="button" className={cx('tb-chip', connectLabel === l && 'is-on')} onClick={() => setConnectLabel(l)}>
                  {l ?? 'No label'}
                </button>
              ))}
            {tray === 'section' && <span className="tb-hint">Click the canvas to place a section · Esc</span>}
          </div>
        </>
      )}
    </div>
  );
}

function ToolButton({ icon, label, shortcut, on, onClick }: { icon: 'cursor' | 'connect' | 'section'; label: string; shortcut: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cx('tb-btn', on && 'is-on')} aria-pressed={on} onClick={onClick} title={`${label} (${shortcut})`} aria-label={label}>
      <Icon name={icon} size={17} />
    </button>
  );
}
