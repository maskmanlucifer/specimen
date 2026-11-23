import { Command } from 'cmdk';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, Kbd } from './ui';
import './palette.css';

export interface PaletteItem {
  id: string;
  label: string;
  /** Right-aligned hint (mono), e.g. a shortcut or a board name. */
  hint?: ReactNode;
  icon?: ReactNode;
  /** Extra words that match the search but are not shown. */
  keywords?: string[];
  run: (opts: { panel: boolean }) => void;
}

export interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

/**
 * ⌘K palette. Groups are static commands; `onQuery` can stream extra results (server search).
 * `onFallback` turns an unmatched query into an action ("Press ↵ to add “…” as a note").
 * ⌘↵ runs an item with `panel: true` (open in the side panel instead of jumping).
 */
export function Palette({ open, onClose, groups, placeholder = 'Search or add', onQuery, fallbackLabel, onFallback }: { open: boolean; onClose: () => void; groups: PaletteGroup[]; placeholder?: string; onQuery?: (q: string) => void; fallbackLabel?: (q: string) => string; onFallback?: (q: string) => void }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  useEffect(() => {
    onQuery?.(q);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const run = (item: PaletteItem, panel = false) => {
    onClose();
    item.run({ panel });
  };
  const all = groups.flatMap((g) => g.items);

  return (
    <div className="ui-backdrop pal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Command
        className="pal"
        label="Command palette"
        loop
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            const sel = document.querySelector<HTMLElement>('.pal [cmdk-item][data-selected="true"]');
            const item = all.find((i) => i.id === sel?.dataset.value);
            if (item) {
              e.preventDefault();
              run(item, true);
            }
          }
        }}
      >
        <div className="pal-input">
          <Icon name="search" />
          <Command.Input autoFocus value={q} onValueChange={setQ} placeholder={placeholder} />
          <Kbd>esc</Kbd>
        </div>
        <Command.List className="pal-list">
          <Command.Empty className="pal-empty">
            {onFallback && q.trim() ? (
              <button type="button" onClick={() => (onClose(), onFallback(q.trim()))}>
                {fallbackLabel?.(q.trim()) ?? `No match. Press ↵ to add “${q.trim()}”.`}
              </button>
            ) : (
              'No match.'
            )}
          </Command.Empty>
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <Command.Group key={g.heading} heading={g.heading}>
                {g.items.map((item) => (
                  <Command.Item key={item.id} value={item.id} keywords={[item.label, ...(item.keywords ?? [])]} onSelect={() => run(item)}>
                    <span className="pal-icon">{item.icon}</span>
                    <span className="pal-label">{item.label}</span>
                    {item.hint && <span className="pal-hint">{item.hint}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
        </Command.List>
        <div className="pal-foot">
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span>⌘↵ open in panel</span>
          <span className="pal-foot-r">Searches text, transcripts, code, sources</span>
        </div>
      </Command>
    </div>
  );
}

/** Opens the palette on ⌘K / Ctrl+K. */
export function usePaletteShortcut(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}
