import type { BoardThumb as Thumb } from '@specimen/schema';

/**
 * Dashboard thumbnail: section and card boxes at their real positions, cropped to the
 * top-left of the board, with one connection curve, on the dotted canvas background.
 * Each card carries its type mark, so a board's content shows at a glance.
 */
export function BoardThumb({ thumb, seed = 0 }: { thumb: Thumb; seed?: number }) {
  const vw = Math.min(thumb.w, 1100);
  const vh = vw * 0.55;
  const y = vh * (0.45 + ((seed % 5) - 2) * 0.04);
  return (
    <svg className="thumb" viewBox={`-30 -30 ${vw + 60} ${vh + 60}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="thumb-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="2" fill="var(--dot)" />
        </pattern>
      </defs>
      <rect x="-30" y="-30" width={vw + 60} height={vh + 60} fill="url(#thumb-dots)" />
      {thumb.sections.map((s, i) => (
        <rect key={`s${i}`} x={s.x} y={s.y} width={s.w} height={s.h} rx={14} fill="var(--section)" stroke="var(--section-line)" strokeWidth={2} />
      ))}
      {thumb.cards.map((c, i) => (
        <g key={`c${i}`}>
          <rect x={c.x} y={c.y} width={c.w} height={Math.min(c.h, 140)} rx={8} fill="var(--surface)" stroke="var(--line)" strokeWidth={2} />
          {/* The card's type mark, as on the canvas. */}
          <rect x={c.x + 12} y={c.y + 12} width={Math.min(28, c.w / 4)} height={7} rx={2} fill={`var(--t-${c.type}, var(--line-2))`} />
        </g>
      ))}
      {thumb.cards.length === 0 && thumb.sections.length === 0 && (
        <text x={vw / 2} y={vh / 2} textAnchor="middle" fontSize={28} fill="var(--faint)" fontFamily="var(--font-mono)">
          EMPTY BOARD
        </text>
      )}
      <path d={`M ${vw * 0.1} ${y} C ${vw * 0.4} ${y - vh * 0.08}, ${vw * 0.6} ${y - vh * 0.02}, ${vw * 0.85} ${y + vh * 0.12}`} fill="none" stroke="var(--muted)" strokeWidth={3} />
    </svg>
  );
}
