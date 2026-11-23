import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_LABEL, type CardType, type LogEvent } from '@specimen/schema';
import { Label, Segmented } from '../components/ui';
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
const DAY = 86_400_000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Time scrubber above the log (after the "timeline" pattern): bars show activity per day, or per
 * hour of the current day. The knob follows the scroll; click or drag the axis to jump.
 */
function LogScrubber({ events, current, onDay, onEvent }: { events: LogEvent[]; current: number | null; onDay: (dayStart: number) => void; onEvent: (id: string) => void }) {
  const [zoom, setZoom] = useState<'days' | 'hours'>('days');
  const axis = useRef<HTMLDivElement>(null);
  const first = startOfDay(Math.min(...events.map((e) => e.at)));
  const last = startOfDay(Math.max(...events.map((e) => e.at)));
  const focusDay = current ?? last;
  const slots =
    zoom === 'days'
      ? Array.from({ length: Math.round((last - first) / DAY) + 1 }, (_, i) => {
          const start = first + i * DAY;
          return { start, count: events.filter((e) => e.at >= start && e.at < start + DAY).length, label: new Date(start).toLocaleDateString('en', { day: 'numeric', month: 'short' }) };
        })
      : Array.from({ length: 24 }, (_, h) => {
          const start = focusDay + h * 3_600_000;
          return { start, count: events.filter((e) => e.at >= start && e.at < start + 3_600_000).length, label: `${String(h).padStart(2, '0')}:00` };
        });
  const max = Math.max(1, ...slots.map((s) => s.count));
  const activeIdx = zoom === 'days' ? slots.findIndex((s) => s.start === focusDay) : -1;
  const labelEvery = Math.ceil(slots.length / 8);

  const pick = (clientX: number) => {
    const r = axis.current!.getBoundingClientRect();
    const i = Math.max(0, Math.min(slots.length - 1, Math.floor(((clientX - r.left) / r.width) * slots.length)));
    const slot = slots[i];
    if (zoom === 'days') onDay(slot.start);
    else {
      const ev = [...events].reverse().find((e) => e.at >= slot.start && e.at < slot.start + 3_600_000);
      if (ev) onEvent(ev.id);
    }
  };

  return (
    <div className="scrub">
      <div className="scrub-head">
        <span className="mono muted">{zoom === 'days' ? `${slots.length} day${slots.length === 1 ? '' : 's'}` : new Date(focusDay).toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        <Segmented
          size="sm"
          value={zoom}
          onChange={setZoom}
          options={[
            { value: 'days', label: 'Days' },
            { value: 'hours', label: 'Hours' },
          ]}
        />
      </div>
      <div
        ref={axis}
        className="scrub-axis"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && pick(e.clientX)}
        role="slider"
        aria-label="Jump through the log"
        aria-valuenow={activeIdx}
      >
        {slots.map((s, i) => (
          <div key={s.start} className={cx('scrub-slot', i === activeIdx && 'is-on', !s.count && 'is-empty')} title={`${s.label} · ${s.count} event${s.count === 1 ? '' : 's'}`}>
            <i style={{ height: `${s.count ? 18 + (s.count / max) * 82 : 6}%` }} />
            {i % labelEvery === 0 && <span className="mono">{s.label}</span>}
          </div>
        ))}
        {activeIdx >= 0 && <div className="scrub-knob" style={{ left: `${((activeIdx + 0.5) / slots.length) * 100}%` }} />}
      </div>
    </div>
  );
}

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
  const main = useRef<HTMLElement>(null);
  const [currentDay, setCurrentDay] = useState<number | null>(null);
  const jumpDay = (start: number) => {
    const el = main.current?.querySelector<HTMLElement>(`[data-day="${start}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentDay(start);
  };
  const jumpEvent = (id: string) => {
    const el = document.getElementById(`ev-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('is-flash');
    setTimeout(() => el?.classList.remove('is-flash'), 1200);
  };
  const groups = useMemo(() => {
    const g = new Map<string, LogEvent[]>();
    for (const e of shown) g.set(dayKey(e.at), [...(g.get(dayKey(e.at)) ?? []), e]);
    return [...g];
  }, [shown]);

  // The knob follows the last day group whose heading has passed the top third of the log.
  useEffect(() => {
    const root = main.current?.parentElement;
    if (!root) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = root.getBoundingClientRect().top + root.clientHeight * 0.3;
        let day: number | null = null;
        root.querySelectorAll<HTMLElement>('[data-day]').forEach((el) => {
          if (el.getBoundingClientRect().top <= line) day = Number(el.dataset.day);
        });
        setCurrentDay(day ?? Number(root.querySelector<HTMLElement>('[data-day]')?.dataset.day));
      });
    };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [groups]);

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
      <main className="log-main" ref={main}>
        <h2 className="display log-title">
          Research <em>log</em>
        </h2>
        <p className="mono muted log-sub">
          {board.cards.length} cards · {events.length} event{events.length === 1 ? '' : 's'}{first ? ` since ${new Date(first.at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}` : ''}
        </p>
        {events.length > 0 && <LogScrubber events={events} current={currentDay} onDay={jumpDay} onEvent={jumpEvent} />}
        {groups.map(([day, list]) => {
          const d = new Date(list[0].at);
          return (
            <section key={day} className="log-day" data-day={startOfDay(list[0].at)}>
              <div className="log-day-h">
                <span className="read">{d.toLocaleDateString('en', { weekday: 'long' })}</span>
                <span className="mono muted">{d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <ul>
                {list.map((e) => {
                  const exists = e.cardId && board.cards.some((c) => c.id === e.cardId);
                  return (
                    <li key={e.id} id={`ev-${e.id}`}>
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
