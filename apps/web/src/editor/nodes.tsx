import { BaseEdge, EdgeLabelRenderer, getBezierPath, Handle, NodeResizeControl, NodeResizer, Position, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { memo, useState } from 'react';
import type { Board, Card, Section } from '@specimen/schema';
import { cx } from '../lib/format';
import { useBoard } from '../store/board';
import type { Upload } from '../store/uploads';
import { CardBody } from './cards/CardBody';

export type CardNodeT = Node<{ card: Card; board: Board; figureNo?: number }, 'card'>;
export type SectionNodeT = Node<{ section: Section; n: number; count: number }, 'section'>;
export type GhostNodeT = Node<{ upload: Upload }, 'ghost'>;

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

/** Connection handles on all four sides. With loose connection mode each acts as source and target. */
function Handles() {
  return (
    <>
      {SIDES.map((p) => (
        <Handle key={p} id={p} type="source" position={p} className="card-handle" />
      ))}
    </>
  );
}

export const CardNode = memo(function CardNode({ data, selected }: NodeProps<CardNodeT>) {
  const { card, board, figureNo } = data;
  const updateCard = useBoard((s) => s.updateCard);
  return (
    <div className={cx('card', `card--${card.type}`, selected && 'is-selected', card.private && 'is-private')} style={{ width: card.w }}>
      <CardBody card={card} board={board} figureNo={figureNo} />
      {card.private && <span className="card-private mono">private</span>}
      <Handles />
      {selected && (
        <NodeResizeControl position="right" minWidth={140} maxWidth={720} className="card-resize" onResizeEnd={(_, p) => updateCard(card.id, { w: Math.round(p.width) })}>
          <span />
        </NodeResizeControl>
      )}
    </div>
  );
});

/** A section: a tinted area with a mono heading "1 · CAPTURE · 5". Double-click the title to rename. */
export const SectionNode = memo(function SectionNode({ data, selected }: NodeProps<SectionNodeT>) {
  const { section, n, count } = data;
  const updateSection = useBoard((s) => s.updateSection);
  const [editing, setEditing] = useState(false);
  return (
    <div className={cx('section', selected && 'is-selected')} style={{ width: section.w, height: section.h }}>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={140} lineClassName="section-resize-line" handleClassName="section-resize-handle" onResizeEnd={(_, p) => updateSection(section.id, { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height) })} />
      <div className="section-head sp-label">
        {n} ·{' '}
        {editing ? (
          <input
            className="section-title-input nodrag"
            autoFocus
            defaultValue={section.title}
            onBlur={(e) => {
              setEditing(false);
              if (e.target.value.trim()) updateSection(section.id, { title: e.target.value.trim() });
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span onDoubleClick={() => setEditing(true)}>{section.title}</span>
        )}
        <span className="section-count"> · {count}</span>
      </div>
      <Handles />
    </div>
  );
});

/** Placeholder for a file that is still uploading ("AUDIO · UPLOADING", progress, time left). */
export const GhostNode = memo(function GhostNode({ data }: NodeProps<GhostNodeT>) {
  const u = data.upload;
  const pct = u.size ? u.received / u.size : 0;
  const elapsed = (Date.now() - u.startedAt) / 1000;
  const left = pct > 0.02 ? Math.round((elapsed / pct) * (1 - pct)) : null;
  return (
    <div className="card card--ghost" style={{ width: 280 }}>
      <div className="card-head">
        <span className="sp-label">
          {u.kind} · {u.status === 'paused' ? 'paused' : 'uploading'}
        </span>
      </div>
      <div className="card-title">{u.name}</div>
      <div className="ghost-bar">
        <i style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="card-time mono">
        {Math.round(u.received / 1048576)} of {Math.round(u.size / 1048576)} MB{u.status === 'paused' ? ' · offline, resumes automatically' : left !== null ? ` · ~${left} s left` : ''}
      </div>
    </div>
  );
});

/** Bezier connection with a mono label chip at its midpoint. Double-click the chip to rename. */
export function LinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, selected, markerEnd }: EdgeProps) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const updateLink = useBoard((s) => s.updateLink);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={cx('link-edge', selected && 'is-selected')} />
      <EdgeLabelRenderer>
        <div className="link-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }} onDoubleClick={() => setEditing(true)}>
          {editing ? (
            <input
              autoFocus
              defaultValue={String(label ?? '')}
              onBlur={(e) => {
                setEditing(false);
                updateLink(id, { label: e.target.value.trim() || undefined });
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          ) : label ? (
            <span className={cx('link-chip', selected && 'is-selected')}>{String(label)}</span>
          ) : (
            <span className="link-chip link-chip--empty" title="Double-click to label">
              +
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const nodeTypes = { card: CardNode, section: SectionNode, ghost: GhostNode };
export const edgeTypes = { link: LinkEdge };
