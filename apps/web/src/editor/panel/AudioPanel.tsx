import { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { formatTime, uid, type AudioMarker, type CardOf } from '@specimen/schema';
import { useMedia } from '@specimen/story';
import { Button, Icon, Label, Toggle } from '../../components/ui';
import { cx } from '../../lib/format';
import { useBoard } from '../../store/board';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Canvas needs real colours, not CSS variables. */
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Waveform editor for an audio card: play, seek, speed, a draggable loop, markers and a
 * transcript synced to the playhead. `full` is the large editing view (design 2b) with
 * keyboard shortcuts; the default is the compact side-panel version (design 1e).
 */
export function AudioEditor({ card, full = false }: { card: CardOf<'audio'>; full?: boolean }) {
  const media = useMedia();
  const update = useBoard((s) => s.updateCard);
  const host = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const regions = useRef<RegionsPlugin | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const cardRef = useRef(card);
  cardRef.current = card;

  const save = useCallback((patch: Partial<CardOf<'audio'>>, log?: string) => update(cardRef.current.id, patch, log), [update]);

  useEffect(() => {
    const regionsPlugin = RegionsPlugin.create();
    const w = WaveSurfer.create({
      container: host.current!,
      height: full ? 140 : 56,
      waveColor: cssVar('--faint-2'),
      progressColor: cssVar('--ink'),
      cursorColor: cssVar('--hot'),
      cursorWidth: 1.5,
      barWidth: 2,
      barGap: 1.5,
      barRadius: 1,
      url: media(card.src),
      peaks: card.peaks ? [card.peaks] : undefined,
      duration: card.duration,
      plugins: [regionsPlugin],
    });
    ws.current = w;
    regions.current = regionsPlugin;
    w.on('timeupdate', (time) => {
      setT(time);
      const loop = cardRef.current.loop;
      if (loop && time >= loop.end) w.setTime(loop.start);
    });
    w.on('play', () => setPlaying(true));
    w.on('pause', () => setPlaying(false));
    w.on('decode', (duration) => {
      if (!cardRef.current.duration || Math.abs(cardRef.current.duration - duration) > 0.2) save({ duration });
    });
    regionsPlugin.on('region-updated', (r: Region) => {
      if (r.id === 'loop') save({ loop: { start: r.start, end: r.end } });
      else save({ markers: cardRef.current.markers.map((m) => (m.id === r.id ? { ...m, t: r.start } : m)) });
    });
    return () => w.destroy();
  }, [card.src, full]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw markers and the loop as regions whenever they change.
  useEffect(() => {
    const r = regions.current;
    if (!r) return;
    r.clearRegions();
    const accent = cssVar('--accent');
    for (const m of card.markers) r.addRegion({ id: m.id, start: m.t, color: accent, drag: true, content: full ? m.label : undefined });
    if (card.loop) r.addRegion({ id: 'loop', start: card.loop.start, end: card.loop.end, color: `color-mix(in srgb, ${cssVar('--hot')} 14%, transparent)`, drag: true, resize: true });
  }, [card.markers, card.loop, full]);

  const addMarker = useCallback(() => {
    const m: AudioMarker = { id: uid('m'), t: ws.current?.getCurrentTime() ?? 0, label: 'Marker' };
    save({ markers: [...cardRef.current.markers, m].sort((a, b) => a.t - b.t) }, `Added marker at ${formatTime(m.t)}`);
  }, [save]);

  const toggleLoop = (on: boolean) => {
    const now = ws.current?.getCurrentTime() ?? 0;
    const dur = cardRef.current.duration ?? ws.current?.getDuration() ?? 10;
    save({ loop: on ? { start: now, end: Math.min(dur, now + 2) } : undefined });
  };
  const setSpd = (s: number) => {
    setSpeed(s);
    ws.current?.setPlaybackRate(s);
  };

  // Full editor shortcuts: Space play · ←/→ 5 s · M marker · [ ] loop edges · L loop · 1–6 speed.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const w = ws.current!;
      const c = cardRef.current;
      if (e.key === ' ') (e.preventDefault(), w.playPause());
      else if (e.key === 'ArrowLeft') w.setTime(Math.max(0, w.getCurrentTime() - 5));
      else if (e.key === 'ArrowRight') w.setTime(w.getCurrentTime() + 5);
      else if (e.key.toLowerCase() === 'm') addMarker();
      else if (e.key === '[') save({ loop: { start: w.getCurrentTime(), end: Math.max(w.getCurrentTime() + 0.5, c.loop?.end ?? 0) } });
      else if (e.key === ']') save({ loop: { start: Math.min(c.loop?.start ?? 0, w.getCurrentTime() - 0.5), end: w.getCurrentTime() } });
      else if (e.key.toLowerCase() === 'l') toggleLoop(!c.loop);
      else if (/^[1-6]$/.test(e.key)) setSpd(SPEEDS[Number(e.key) - 1]);
      else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [full, addMarker]); // eslint-disable-line react-hooks/exhaustive-deps

  const dur = card.duration ?? 0;
  const currentLine = [...card.transcript].reverse().find((l) => l.t <= t + 0.05);

  return (
    <div className={cx('aed', full && 'aed--full')}>
      <div ref={host} className="aed-wave" />
      {full && (
        <div className="aed-ticks mono">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i}>{formatTime((dur * i) / 5, false)}</span>
          ))}
        </div>
      )}
      <div className="aed-controls">
        {full && (
          <button type="button" className="aed-skip mono" onClick={() => ws.current?.setTime(Math.max(0, t - 5))}>
            −5
          </button>
        )}
        <button type="button" className="aed-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => ws.current?.playPause()}>
          <Icon name={playing ? 'pause' : 'play'} size={14} />
        </button>
        {full && (
          <button type="button" className="aed-skip mono" onClick={() => ws.current?.setTime(t + 5)}>
            +5
          </button>
        )}
        <span className="mono aed-time">
          {formatTime(t)} / {formatTime(dur)}
        </span>
        <select className="aed-speed mono" value={speed} onChange={(e) => setSpd(Number(e.target.value))} aria-label="Speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <label className="aed-loop mono">
          Loop
          <Toggle checked={!!card.loop} onChange={toggleLoop} label="Loop" />
        </label>
        {card.loop && full && (
          <span className="mono muted">
            {card.loop.start.toFixed(1)}–{card.loop.end.toFixed(1)} s
          </span>
        )}
      </div>

      <div className="aed-cols">
        <div>
          <div className="panel-sec-head">
            <Label>Markers</Label>
            <button type="button" className="aed-link mono" onClick={addMarker}>
              + Add at playhead <kbd className="ui-kbd">M</kbd>
            </button>
          </div>
          <ul className="aed-markers">
            {card.markers.map((m) => (
              <li key={m.id}>
                <button type="button" className="mono aed-t" onClick={() => (ws.current?.setTime(m.t), ws.current?.play())}>
                  {formatTime(m.t)}
                </button>
                <input
                  className="aed-input"
                  defaultValue={m.label}
                  onKeyDown={(e) => e.stopPropagation()}
                  onBlur={(e) => e.target.value !== m.label && save({ markers: card.markers.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)) })}
                />
                <button type="button" className="panel-x" aria-label="Remove marker" onClick={() => save({ markers: card.markers.filter((x) => x.id !== m.id) })}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
            {!card.markers.length && <li className="panel-muted">No markers yet.</li>}
          </ul>
        </div>
        <div>
          <div className="panel-sec-head">
            <Label>Transcript{full ? ' · editable' : ''}</Label>
            <button type="button" className="aed-link mono" onClick={() => save({ transcript: [...card.transcript, { t, text: '' }].sort((a, b) => a.t - b.t) })}>
              + Line at playhead
            </button>
          </div>
          {full && <p className="panel-muted">Click a time to jump.</p>}
          <ul className="aed-lines">
            {card.transcript.map((l, i) => (
              <li key={`${l.t}-${i}`} className={cx(l === currentLine && 'is-current')}>
                <button type="button" className="mono aed-t" onClick={() => ws.current?.setTime(l.t)}>
                  {formatTime(l.t, false)}
                </button>
                <input
                  className="aed-input"
                  defaultValue={l.text}
                  placeholder="What is heard here"
                  onKeyDown={(e) => e.stopPropagation()}
                  onBlur={(e) => e.target.value !== l.text && save({ transcript: card.transcript.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                />
              </li>
            ))}
            {!card.transcript.length && <li className="panel-muted">No transcript. Add lines while you listen.</li>}
          </ul>
        </div>
      </div>
      {full && <p className="mono aed-keys">Space play · ←/→ 5 s · M marker · [ ] set loop · L loop · 1–6 speed</p>}
    </div>
  );
}

/** Side-panel audio section with a button to open the full editor. */
export function AudioPanel({ card }: { card: CardOf<'audio'> }) {
  const [full, setFull] = useState(false);
  return (
    <>
      <div className="panel-title">{card.title}</div>
      {!full && <AudioEditor card={card} />}
      <Button size="sm" icon="external" onClick={() => setFull(true)}>
        Open editor
      </Button>
      {full && (
        <div className="aed-overlay" role="dialog" aria-label="Audio editor">
          <div className="aed-overlay-head">
            <div>
              <Label>Audio · editing</Label>
              <div className="panel-title">{card.title}</div>
              <span className="mono muted">{card.src}</span>
            </div>
            <Button onClick={() => setFull(false)}>Done</Button>
          </div>
          <AudioEditor card={card} full />
        </div>
      )}
    </>
  );
}
