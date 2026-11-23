import { useMemo, useState } from 'react';
import { CARD_LABEL, type CardType, type LogEvent } from '@specimen/schema';
import { Label } from '../components/ui';
import { cx } from '../lib/format';
import { useBoard } from '../store/board';

const FILTERS: { key: string; label: string; types: (CardType | undefined)[] | null }[] = [
  { key: 'all', label: 'Everything', types: null },
  { key: 'notes', label: 'Notes & facts', types: ['note', 'fact', 'quote'] },
  { key: 'questions', label: 'Questions', types: ['question'] },
  { key: 'sources', label: 'Sources', types: ['link', 'document'] },
  { key: 'media', label: 'Media', types: ['image', 'audio', 'video'] },
  { key: 'code', label: 'Code & math', types: ['code', 'math'] },
  { key: 'figures', label: 'Figures', types: ['figure'] },
];

const dayKey = (t: number) => new Date(t).toDateString();

/**
 * The research log: the same board as a journal, newest day first. Filters by card type;
 * the month grid shows how active each day was. Click an entry to find the card on the canvas.
 */
export function LogView({ onOpen }: { onOpen: (cardId: string) => void }) {
  const board = useBoard((s) => s.board)!;
  const [filter, setFilter] = useState('all');
  const sectionTitle = (id?: string) => board.sections.find((s) => s.id === id)?.title;

  const events = useMemo(() => [...board.log].sort((a, b) => b.at - a.at), [board.log]);
  const match = (e: LogEvent, key: string) => {
    const f = FILTERS.find((x) => x.key === key)!;
    return !f.types || f.types.includes(e.cardType as CardType);
  };
  const shown = events.filter((e) => match(e, filter));
  const groups = useMemo(() => {
    const g = new Map<string, LogEvent[]>();
    for (const e of shown) g.set(dayKey(e.at), [...(g.get(dayKey(e.at)) ?? []), e]);
    return [...g];
  }, [shown]);

  // Month heat grid for the month of the latest event.
  const ref = new Date(events[0]?.at ?? Date.now());
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const perDay = new Map<number, number>();
  for (const e of events) {
    const d = new Date(e.at);
    if (d.getFullYear() === year && d.getMonth() === month) perDay.set(d.getDate(), (perDay.get(d.getDate()) ?? 0) + 1);
  }
  const max = Math.max(1, ...perDay.values());
  const first = events[events.length - 1];

  return (
    <div className="log">
      <aside className="log-side">
        <Label>Show</Label>
        <ul className="log-filters">
          {FILTERS.map((f) => (
            <li key={f.key}>
              <button type="button" className={cx(filter === f.key && 'is-on')} onClick={() => setFilter(f.key)}>
                <span>{f.label}</span>
                <span className="mono">{events.filter((e) => match(e, f.key)).length}</span>
              </button>
            </li>
          ))}
        </ul>
        <Label>{ref.toLocaleString('en', { month: 'long', year: 'numeric' })}</Label>
        <div className="log-cal">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="log-cal-h mono">
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const n = perDay.get(i + 1) ?? 0;
            return (
              <span key={i} className="log-cal-d mono" style={{ background: n ? `color-mix(in srgb, var(--accent) ${15 + (n / max) * 70}%, transparent)` : undefined, color: n / max > 0.5 ? 'var(--on-accent)' : undefined }} title={`${n} events`}>
                {i + 1}
              </span>
            );
          })}
        </div>
        <p className="panel-muted">Darker days had more activity.</p>
      </aside>
      <main className="log-main">
        <h2 className="display log-title">
          Research <em>log</em>
        </h2>
        <p className="mono muted">
          {board.cards.length} cards · {events.length} event{events.length === 1 ? '' : 's'}{first ? ` since ${new Date(first.at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}` : ''}
        </p>
        {groups.map(([day, list]) => {
          const d = new Date(list[0].at);
          return (
            <section key={day} className="log-day">
              <div className="log-day-h">
                <span className="serif">{d.toLocaleDateString('en', { weekday: 'long' })}</span>
                <span className="mono muted">{d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <ul>
                {list.map((e) => {
                  const exists = e.cardId && board.cards.some((c) => c.id === e.cardId);
                  return (
                    <li key={e.id}>
                      <button type="button" className="log-ev" disabled={!exists} onClick={() => exists && onOpen(e.cardId!)}>
                        <span className="mono muted">{new Date(e.at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        <span className="mono log-action">{e.action}</span>
                        <span className="sp-label">{e.cardType ? CARD_LABEL[e.cardType as CardType] : ''}</span>
                        <span className="log-text">{e.text}</span>
                        <span className="mono muted log-sec">{sectionTitle(e.sectionId)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {!groups.length && <p className="panel-muted">No events for this filter.</p>}
      </main>
    </div>
  );
}
