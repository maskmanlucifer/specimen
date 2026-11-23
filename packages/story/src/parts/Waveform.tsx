import type { AudioMarker } from '@specimen/schema';

/**
 * Static waveform from stored peaks, with marker dots and a playhead. Used on canvas cards and
 * in the story, where decoding the audio just to draw bars would be wasteful.
 * Bars are SVG (stretched to fit); markers are HTML so their dots stay round.
 *
 * @param progress - Playhead position, 0–1.
 * @param onSeek - Called with a 0–1 position when the user clicks the waveform.
 */
export function Waveform({ peaks, duration = 1, markers = [], progress = 0, height = 32, onSeek }: { peaks: number[]; duration?: number; markers?: AudioMarker[]; progress?: number; height?: number; onSeek?: (p: number) => void }) {
  const n = peaks.length || 1;
  const bw = 100 / n;
  return (
    <div
      className="sp-wave"
      style={{ height }}
      onClick={
        onSeek
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
            }
          : undefined
      }
      role={onSeek ? 'slider' : 'img'}
      aria-label="Waveform"
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
    >
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height}>
        {peaks.map((p, i) => {
          const h = Math.max(1.5, p * (height - 8));
          return <rect key={i} x={i * bw + bw * 0.2} width={bw * 0.6} y={(height - h) / 2 + 3} height={h} fill={i / n < progress ? 'var(--ink)' : 'var(--faint-2)'} />;
        })}
      </svg>
      {markers.map((m) => (
        <span key={m.id} className="sp-wave-marker" style={{ left: `${(m.t / duration) * 100}%` }} title={m.label} />
      ))}
      {progress > 0 && <span className="sp-wave-head" style={{ left: `${progress * 100}%` }} />}
    </div>
  );
}
