import { useState, type ReactNode } from 'react';
import { CARD_LABEL, cardText, formatBytes, type Card, type CardOf, type Section } from '@specimen/schema';
import { TeX } from '@specimen/story';
import { Button, Field, Icon, Label, StorageBadge, Toggle } from '../../components/ui';
import { useBoard } from '../../store/board';
import { AudioPanel } from './AudioPanel';
import { FigurePanel } from './FigurePanel';
import './panel.css';

export function PanelSection({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="panel-sec">
      <div className="panel-sec-head">
        <Label>{title}</Label>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A text field that saves on blur, so typing is one undo step, not one per key. */
export function LazyText({ value, onCommit, multiline, mono, placeholder, rows = 3 }: { value: string; onCommit: (v: string) => void; multiline?: boolean; mono?: boolean; placeholder?: string; rows?: number }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : value;
  const props = {
    className: `ui-input${mono ? ' ui-input--mono' : ''}`,
    value: shown,
    placeholder,
    onFocus: () => (setDraft(value), setFocused(true)),
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => {
      setFocused(false);
      if (draft !== value) onCommit(draft);
    },
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };
  return multiline ? <textarea {...props} rows={rows} /> : <input {...props} />;
}

function TypeEditor({ card }: { card: Card }) {
  const update = useBoard((s) => s.updateCard);
  const set = (patch: Partial<Card>) => update(card.id, patch, `Edited ${card.type}`);
  switch (card.type) {
    case 'note':
    case 'question':
      return <LazyText multiline rows={5} value={card.text} onCommit={(text) => set({ text })} />;
    case 'fact':
      return (
        <>
          <LazyText multiline rows={4} value={card.text} onCommit={(text) => set({ text })} />
          <label className="panel-row">
            <span>Verified</span>
            <Toggle checked={card.verified} onChange={(verified) => set({ verified } as Partial<CardOf<'fact'>>)} label="Verified" />
          </label>
        </>
      );
    case 'quote':
      return (
        <>
          <LazyText multiline rows={4} value={card.text} onCommit={(text) => set({ text })} />
          <Field label="Cite">
            <LazyText value={card.cite ?? ''} onCommit={(cite) => set({ cite: cite || undefined } as Partial<CardOf<'quote'>>)} placeholder="Claude Shannon, 1948" />
          </Field>
        </>
      );
    case 'link':
      return (
        <>
          <Field label="URL">
            <LazyText mono value={card.url} onCommit={(url) => set({ url } as Partial<CardOf<'link'>>)} />
          </Field>
          <Field label="Title">
            <LazyText value={card.title ?? ''} onCommit={(title) => set({ title } as Partial<CardOf<'link'>>)} />
          </Field>
          <Field label="Description">
            <LazyText multiline value={card.description ?? ''} onCommit={(description) => set({ description } as Partial<CardOf<'link'>>)} />
          </Field>
        </>
      );
    case 'image':
      return (
        <>
          <Field label="Caption">
            <LazyText value={card.caption ?? ''} onCommit={(caption) => set({ caption: caption || undefined } as Partial<CardOf<'image'>>)} />
          </Field>
          <Field label="Alt text" hint="Read aloud by screen readers.">
            <LazyText value={card.alt ?? ''} onCommit={(alt) => set({ alt } as Partial<CardOf<'image'>>)} />
          </Field>
        </>
      );
    case 'video':
    case 'document':
      return (
        <Field label="Title">
          <LazyText value={card.title} onCommit={(title) => set({ title } as Partial<CardOf<'video'>>)} />
        </Field>
      );
    case 'code':
      return (
        <>
          <Field label="Language">
            <LazyText mono value={card.lang} onCommit={(lang) => set({ lang } as Partial<CardOf<'code'>>)} />
          </Field>
          <LazyText multiline mono rows={10} value={card.code} onCommit={(code) => set({ code } as Partial<CardOf<'code'>>)} />
          <Field label="Highlight lines" hint="Comma-separated, e.g. 3, 5">
            <LazyText mono value={card.highlight.join(', ')} onCommit={(v) => set({ highlight: v.split(/[,\s]+/).map(Number).filter((n) => n > 0) } as Partial<CardOf<'code'>>)} />
          </Field>
        </>
      );
    case 'math':
      return (
        <>
          <LazyText multiline mono rows={3} value={card.tex} onCommit={(tex) => set({ tex } as Partial<CardOf<'math'>>)} />
          <div className="panel-math">
            <TeX tex={card.tex} display />
          </div>
        </>
      );
    case 'audio':
      return <AudioPanel card={card} />;
    case 'figure':
      return <FigurePanel card={card} />;
  }
}

function Tags({ card }: { card: Card }) {
  const update = useBoard((s) => s.updateCard);
  const [adding, setAdding] = useState(false);
  return (
    <div className="panel-tags">
      {card.tags.map((t) => (
        <button key={t} type="button" className="panel-tag mono" title="Remove tag" onClick={() => update(card.id, { tags: card.tags.filter((x) => x !== t) })}>
          {t}
        </button>
      ))}
      {adding ? (
        <input
          className="panel-tag-input mono"
          autoFocus
          onKeyDown={(e) => {
            e.stopPropagation();
            const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
            if (e.key === 'Enter' && v) update(card.id, { tags: [...new Set([...card.tags, v])] });
            if (e.key === 'Enter' || e.key === 'Escape') setAdding(false);
          }}
          onBlur={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="panel-tag panel-tag--add mono" onClick={() => setAdding(true)}>
          + tag
        </button>
      )}
    </div>
  );
}

function Connections({ id }: { id: string }) {
  const board = useBoard((s) => s.board)!;
  const removeIds = useBoard((s) => s.removeIds);
  const select = useBoard((s) => s.select);
  const links = board.links.filter((l) => l.from === id || l.to === id);
  const name = (otherId: string) => {
    const c = board.cards.find((x) => x.id === otherId);
    if (c) return c.type === 'figure' ? `${c.title ?? c.plugin}` : `${CARD_LABEL[c.type]}: ${cardText(c).slice(0, 36)}…`;
    return board.sections.find((s) => s.id === otherId)?.title ?? 'Unknown';
  };
  if (!links.length) return <p className="panel-muted">None. Use the connect tool, or drag from a card edge.</p>;
  return (
    <ul className="panel-links">
      {links.map((l) => {
        const other = l.from === id ? l.to : l.from;
        return (
          <li key={l.id}>
            <span className="mono">{l.label ?? 'see also'} {l.from === id ? '→' : '←'}</span>
            <button type="button" onClick={() => select([other])}>
              {name(other)}
            </button>
            <button type="button" className="panel-x" aria-label="Remove connection" onClick={() => removeIds([l.id])}>
              <Icon name="x" size={12} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SectionPanel({ section }: { section: Section }) {
  const update = useBoard((s) => s.updateSection);
  const board = useBoard((s) => s.board)!;
  const removeIds = useBoard((s) => s.removeIds);
  return (
    <>
      <div className="panel-body">
        <Field label="Title">
          <LazyText value={section.title} onCommit={(title) => title.trim() && update(section.id, { title: title.trim() })} />
        </Field>
        <Field label="Lead paragraph" hint="Shown under the heading in the published story.">
          <LazyText multiline rows={4} value={section.intro ?? ''} onCommit={(intro) => update(section.id, { intro: intro || undefined })} />
        </Field>
        <PanelSection title="Cards">
          <p className="panel-muted">{board.cards.filter((c) => c.sectionId === section.id).length} cards. Set the reading order in Publish → Reading order.</p>
        </PanelSection>
      </div>
      <div className="panel-foot">
        <Button variant="danger" size="sm" icon="trash" onClick={() => removeIds([section.id])}>
          Remove section (keeps cards)
        </Button>
      </div>
    </>
  );
}

/** Right-hand panel for the selected card or section. */
export function SidePanel({ id, onClose }: { id: string; onClose: () => void }) {
  const board = useBoard((s) => s.board)!;
  const storage = useBoard((s) => s.storage);
  const update = useBoard((s) => s.updateCard);
  const removeIds = useBoard((s) => s.removeIds);
  const card = board.cards.find((c) => c.id === id);
  const section = board.sections.find((s) => s.id === (card?.sectionId ?? id));
  const sectionNo = section ? board.trail.indexOf(section.id) + 1 : 0;

  if (!card && section)
    return (
      <aside className="panel" aria-label="Section">
        <div className="panel-head">
          <Label>Section · {sectionNo}</Label>
          <button type="button" className="panel-close" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <SectionPanel section={section} />
      </aside>
    );
  if (!card) return null;

  return (
    <aside className="panel" aria-label={`${CARD_LABEL[card.type]} card`}>
      <div className="panel-head">
        <Label>
          {CARD_LABEL[card.type]} card{section ? ` · ${sectionNo} · ${section.title}` : ''}
        </Label>
        <button type="button" className="panel-close" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="panel-body">
        <TypeEditor card={card} />
        {card.type !== 'figure' && (
          <PanelSection title="Source">
            <LazyText mono value={card.source?.url ?? ''} placeholder="Add a source URL" onCommit={(url) => update(card.id, { source: { ...card.source, url: url || undefined } })} />
            <div className="panel-two">
              <LazyText value={card.source?.label ?? ''} placeholder="Label, e.g. Wang 2003" onCommit={(label) => update(card.id, { source: { ...card.source, label: label || undefined } })} />
              <LazyText value={card.source?.locator ?? ''} placeholder="p. 2" onCommit={(locator) => update(card.id, { source: { ...card.source, locator: locator || undefined } })} />
            </div>
          </PanelSection>
        )}
        <PanelSection title="Tags">
          <Tags card={card} />
        </PanelSection>
        <PanelSection title="Connections">
          <Connections id={card.id} />
        </PanelSection>
        <PanelSection title="Visibility">
          <label className="panel-row">
            <span>
              Private
              <small>Never included in a published copy.</small>
            </span>
            <Toggle checked={card.private} onChange={(v) => update(card.id, { private: v })} label="Private" />
          </label>
        </PanelSection>
      </div>
      <div className="panel-foot">
        {'src' in card && !/^https?:/.test(card.src) && (
          <span className="panel-file mono">
            {card.src}
            {'size' in card && card.size ? ` · ${formatBytes(card.size)}` : ''}
          </span>
        )}
        {card.type === 'figure' && <span className="panel-file mono">plugins/{card.plugin}@{board.plugins[card.plugin] ?? 'latest'}</span>}
        {storage && (
          <span className="panel-store">
            <StorageBadge kind={storage.kind} /> {storage.name}
          </span>
        )}
      </div>
      <div className="panel-foot">
        <Button variant="danger" size="sm" icon="trash" onClick={() => removeIds([card.id])}>
          Delete card
        </Button>
      </div>
    </aside>
  );
}
