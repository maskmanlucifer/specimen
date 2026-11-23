import type { ReactNode } from 'react';
import './iso.css';

/**
 * Small isometric drawing kit for empty and error states, in the technical-drawing style of the
 * figures: even 1.2 px ink strokes, three face tones, mono callouts with leader lines.
 */

const C = Math.cos(Math.PI / 6);
const S = 0.5;

/** Projects board-space (x right, y toward the viewer's left, z up) to SVG coordinates. */
export function iso(x: number, y: number, z: number): [number, number] {
  return [(x - y) * C, (x + y) * S - z];
}

const pts = (list: [number, number, number][]) => list.map(([x, y, z]) => iso(x, y, z).join(',')).join(' ');

/** A box with its top, front-left and front-right faces. `tone` picks the face fills. */
export function IsoBox({ x, y, z, w, d, h, tone = 'paper' }: { x: number; y: number; z: number; w: number; d: number; h: number; tone?: 'paper' | 'section' | 'hot' | 'accent' }) {
  return (
    <g className={`iso-box iso-${tone}`}>
      <polygon className="iso-top" points={pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} />
      <polygon className="iso-left" points={pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} />
      <polygon className="iso-right" points={pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} />
    </g>
  );
}

/** A flat rectangle drawn on the front-left face plane (y = const), e.g. a drawer front or a label. */
export function IsoPanel({ x, y, z, w, h, className }: { x: number; y: number; z: number; w: number; h: number; className?: string }) {
  return <polygon className={className ?? 'iso-line'} points={pts([[x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]])} />;
}

/** Text laid on the front-left face plane, so it looks printed on the object. */
export function IsoText({ x, y, z, children, size = 14 }: { x: number; y: number; z: number; children: ReactNode; size?: number }) {
  const [tx, ty] = iso(x, y, z);
  return (
    <text className="iso-text" transform={`matrix(${C} ${S} 0 1 ${tx} ${ty})`} fontSize={size}>
      {children}
    </text>
  );
}

/** A callout: dot at the anchor, an elbow leader line, and an upper-case mono label. */
export function IsoCallout({ at, to, label, align = 'start' }: { at: [number, number, number]; to: [number, number]; label: string; align?: 'start' | 'end' }) {
  const [ax, ay] = iso(...at);
  const [tx, ty] = to;
  const run = align === 'start' ? 14 : -14;
  return (
    <g className="iso-callout">
      <circle cx={ax} cy={ay} r={2.4} />
      <polyline points={`${ax},${ay} ${tx},${ty} ${tx + run},${ty}`} />
      <text x={tx + run + (align === 'start' ? 6 : -6)} y={ty + 3.5} textAnchor={align}>
        {label}
      </text>
    </g>
  );
}

/** 404: a specimen cabinet with drawer "404" pulled out — and nothing filed in it. */
export function IsoCabinet() {
  const W = 150;
  const D = 110;
  return (
    <svg className="iso" viewBox="-300 -210 520 330" role="img" aria-label="An empty drawer labelled 404, pulled out of a cabinet">
      <IsoBox x={0} y={0} z={0} w={W} d={D} h={156} />
      {[108, 58, 8].map((z, i) => (
        <g key={z}>
          {i !== 1 && <IsoPanel x={10} y={D} z={z} w={W - 20} h={40} />}
          {i !== 1 && <IsoPanel x={W / 2 - 16} y={D} z={z + 24} w={32} h={8} className="iso-line iso-plate" />}
        </g>
      ))}
      {/* the pulled-out middle drawer */}
      <IsoBox x={10} y={D - 40} z={58} w={W - 20} d={86} h={40} />
      <polygon className="iso-hollow" points={pts([[16, D - 34, 98], [W - 16, D - 34, 98], [W - 16, D + 40, 98], [16, D + 40, 98]])} />
      <IsoPanel x={W / 2 - 22} y={D + 46} z={70} w={44} h={18} className="iso-line iso-plate-hot" />
      <IsoText x={W / 2 - 17} y={D + 46} z={74} size={13}>
        404
      </IsoText>
      <IsoCallout at={[W / 2 - 10, D + 20, 98]} to={[-150, 40]} label="Drawer 404 · empty" align="end" />
      <IsoCallout at={[W - 10, 0, 156]} to={[175, -175]} label="Nothing filed at this path" align="end" />
    </svg>
  );
}

/** Empty board: a section tray with three cards dropping in. */
export function IsoTray() {
  return (
    <svg className="iso" viewBox="-190 -150 400 310" role="img" aria-label="Cards dropping into an empty section">
      <IsoBox x={0} y={0} z={0} w={170} d={120} h={10} tone="section" />
      <IsoBox x={24} y={26} z={52} w={62} d={44} h={3} />
      <IsoBox x={98} y={18} z={86} w={52} d={38} h={3} tone="accent" />
      <IsoBox x={70} y={70} z={30} w={70} d={34} h={3} tone="hot" />
      <IsoCallout at={[55, 48, 55]} to={[-140, -95]} label="Paste ⌘V" />
      <IsoCallout at={[124, 37, 89]} to={[170, -120]} label="Drop files" align="end" />
      <IsoCallout at={[105, 87, 33]} to={[165, 40]} label="Write N" align="end" />
    </svg>
  );
}
