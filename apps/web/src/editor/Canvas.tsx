import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useViewport,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildStory, type Board } from '@specimen/schema';
import { cx } from '../lib/format';
import { fileKind } from '../lib/capture';
import { useBoard } from '../store/board';
import { useUploads } from '../store/uploads';
import { sectionPushes, sectionRects } from './layout';
import { edgeTypes, nodeTypes } from './nodes';
import type { useCapture } from './useCapture';

export type Tool = 'select' | 'connect' | 'section';

/** Figure numbers in story order, so the canvas label matches the published "Fig. n". */
function figureNumbers(board: Board): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of buildStory(board).sections) for (const b of s.blocks) if (b.kind === 'figure') out.set(b.card.id, b.figure);
  return out;
}

function toNodes(board: Board, selection: string[], uploads: ReturnType<typeof useUploads.getState>['uploads'], heights: Map<string, number>): Node[] {
  const figs = figureNumbers(board);
  const sel = new Set(selection);
  const rects = sectionRects(board, heights);
  const sections: Node[] = board.sections.map((s, i) => {
    const fit = rects.get(s.id)!;
    return {
      id: s.id,
      type: 'section',
      position: { x: s.x, y: s.y },
      data: { section: { ...s, ...fit }, n: board.trail.indexOf(s.id) >= 0 ? board.trail.indexOf(s.id) + 1 : i + 1, count: board.cards.filter((c) => c.sectionId === s.id).length },
      selected: sel.has(s.id),
      zIndex: 0,
      dragHandle: '.section-head',
      width: fit.w,
      height: fit.h,
    };
  });
  const cards: Node[] = board.cards.map((c) => ({ id: c.id, type: 'card', position: { x: c.x, y: c.y }, data: { card: c, board, figureNo: figs.get(c.id) }, selected: sel.has(c.id), zIndex: sel.has(c.id) ? 3 : 2 }));
  const ghosts: Node[] = uploads.filter((u) => u.status !== 'done').map((u) => ({ id: u.id, type: 'ghost', position: u.at, data: { upload: u }, draggable: false, selectable: false, zIndex: 4 }));
  return [...sections, ...cards, ...ghosts];
}

/**
 * Picks which sides an edge leaves and enters by, from the boxes' relative position:
 * mostly sideways → right/left, mostly vertical → bottom/top (and the reverse).
 */
function sides(board: Board, from: string, to: string, heights: Map<string, number>) {
  const box = (id: string) => {
    const c = board.cards.find((x) => x.id === id);
    if (c) return { x: c.x, y: c.y, w: c.w, h: heights.get(id) ?? 100 };
    const s = board.sections.find((x) => x.id === id);
    return s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null;
  };
  const a = box(from);
  const b = box(to);
  if (!a || !b) return {};
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (gapX > gapY) return dx > 0 ? { sourceHandle: 'right', targetHandle: 'left' } : { sourceHandle: 'left', targetHandle: 'right' };
  return dy > 0 ? { sourceHandle: 'bottom', targetHandle: 'top' } : { sourceHandle: 'top', targetHandle: 'bottom' };
}

function toEdges(board: Board, heights: Map<string, number>): Edge[] {
  return board.links.map((l) => ({ id: l.id, source: l.from, target: l.to, ...sides(board, l.from, l.to, heights), type: 'link', label: l.label, zIndex: 1, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--muted)' } }));
}

/**
 * Completes a connection dropped anywhere on a card, not only on its small handle dots.
 * React Flow reports such a drop as invalid; the card under the pointer becomes the target.
 */
const connectOnDrop: OnConnectEnd = (e, state) => {
  if (state.isValid || !state.fromNode) return;
  const pt = 'changedTouches' in e ? e.changedTouches[0] : e;
  const id = (document.elementFromPoint(pt.clientX, pt.clientY)?.closest('.react-flow__node') as HTMLElement | null)?.dataset.id;
  if (id && id !== state.fromNode.id && !id.startsWith('up_')) useBoard.getState().addLink(state.fromNode.id, id);
};

/**
 * The board canvas. Positions live in the board; while dragging, React Flow's local copy leads
 * and the result is committed once on drop (one undo step, one save).
 */
export function Canvas({ tool, setTool, capture, onOpenPanel, onEmptyHint }: { tool: Tool; setTool: (t: Tool) => void; capture: ReturnType<typeof useCapture>; onOpenPanel: (id: string) => void; onEmptyHint: boolean }) {
  const board = useBoard((s) => s.board)!;
  const selection = useBoard((s) => s.selection);
  const uploads = useUploads((s) => s.uploads);
  const rf = useReactFlow();
  const [heights, setHeights] = useState(() => new Map<string, number>());
  const [nodes, setNodes] = useState<Node[]>(() => toNodes(board, selection, uploads, heights));
  const [edges, setEdges] = useState<Edge[]>(() => toEdges(board, new Map()));
  const dragging = useRef(false);
  const dragStart = useRef(new Map<string, { x: number; y: number }>());
  const wrap = useRef<HTMLDivElement>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const [dropKind, setDropKind] = useState<string | null>(null);

  useEffect(() => {
    if (!dragging.current) setNodes(toNodes(board, selection, uploads, heights));
  }, [board, selection, uploads, heights]);
  useEffect(() => setEdges(toEdges(board, heights)), [board, heights]);

  // When a section grows to fit its cards, move the sections under it down so the gap stays even.
  useEffect(() => {
    if (dragging.current) return;
    const shifts = sectionPushes(board, heights);
    if (!shifts.size) return;
    useBoard.getState().change(
      (b) => {
        for (const s of b.sections) if (shifts.has(s.id)) s.y += shifts.get(s.id)!;
        for (const c of b.cards) if (c.sectionId && shifts.has(c.sectionId)) c.y += shifts.get(c.sectionId)!;
      },
      { history: false },
    );
  }, [board, heights]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const next = applyNodeChanges(changes, nds);
      const measured = changes.filter((c): c is Extract<NodeChange, { type: 'dimensions' }> => c.type === 'dimensions' && !!c.dimensions);
      if (measured.length)
        queueMicrotask(() =>
          setHeights((prev) => {
            if (measured.every((c) => Math.abs((prev.get(c.id) ?? 0) - c.dimensions!.height) < 1)) return prev;
            const m = new Map(prev);
            for (const c of measured) m.set(c.id, c.dimensions!.height);
            return m;
          }),
        );
      if (changes.some((c) => c.type === 'select')) {
        const ids = next.filter((n) => n.selected).map((n) => n.id);
        queueMicrotask(() => useBoard.getState().select(ids));
      }
      return next;
    });
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  /** Centre of the visible canvas, or the last pointer position, in board coordinates. */
  const dropPoint = useCallback(() => {
    if (mouse.current) return mouse.current;
    const r = wrap.current!.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: r.left + r.width / 2 - 120, y: r.top + r.height / 2 - 40 });
  }, [rf]);

  // Paste anywhere on the board (outside text fields) creates a card at the pointer.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable], .cm-editor')) return;
      if (capture.fromData(e.clipboardData, dropPoint())) e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [capture, dropPoint]);

  const onDragStart = (_: unknown, node: Node) => {
    dragging.current = true;
    dragStart.current.clear();
    if (node.type === 'section') for (const c of board.cards) if (c.sectionId === node.id) dragStart.current.set(c.id, { x: c.x, y: c.y });
    dragStart.current.set(node.id, { ...node.position });
  };

  const onDrag = (_: unknown, node: Node) => {
    if (node.type !== 'section') return;
    const start = dragStart.current.get(node.id)!;
    const dx = node.position.x - start.x;
    const dy = node.position.y - start.y;
    setNodes((nds) => nds.map((n) => (dragStart.current.has(n.id) && n.id !== node.id ? { ...n, position: { x: dragStart.current.get(n.id)!.x + dx, y: dragStart.current.get(n.id)!.y + dy } } : n)));
  };

  const onDragStop = (_: unknown, __: Node, dragged: Node[]) => {
    dragging.current = false;
    const moved = new Map<string, { x: number; y: number }>();
    for (const n of dragged) moved.set(n.id, n.position);
    // Cards carried by a dragged section move by exactly the section's delta (React state may lag the pointer).
    const sec = dragged.find((n) => n.type === 'section');
    if (sec) {
      const s0 = dragStart.current.get(sec.id)!;
      const dx = sec.position.x - s0.x;
      const dy = sec.position.y - s0.y;
      for (const [id, p0] of dragStart.current) if (id !== sec.id) moved.set(id, { x: p0.x + dx, y: p0.y + dy });
    }
    const heights = new Map(nodes.map((n) => [n.id, n.measured?.height ?? 80]));
    const anyMoved = [...moved].some(([id, p]) => {
      const o = board.cards.find((c) => c.id === id) ?? board.sections.find((s) => s.id === id);
      return o && (Math.round(o.x) !== Math.round(p.x) || Math.round(o.y) !== Math.round(p.y));
    });
    if (!anyMoved) return;
    const draggedSection = dragged.some((n) => n.type === 'section');
    useBoard.getState().change(
      (b) => {
        for (const s of b.sections) if (moved.has(s.id)) Object.assign(s, { x: Math.round(moved.get(s.id)!.x), y: Math.round(moved.get(s.id)!.y) });
        for (const c of b.cards) {
          const p = moved.get(c.id);
          if (!p) continue;
          c.x = Math.round(p.x);
          c.y = Math.round(p.y);
          // Cards carried along with their section keep it; a card dropped on its own joins the section under its centre.
          if (!draggedSection) {
            const cx = c.x + c.w / 2;
            const cy = c.y + heights.get(c.id)! / 2;
            c.sectionId = b.sections.find((s) => cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h)?.id ?? null;
          }
        }
      },
      { log: { action: 'moved', text: dragged.length === 1 ? 'Moved a card' : `Moved ${dragged.length} items` } },
    );
  };

  return (
    <div
      ref={wrap}
      className={cx('canvas', `tool-${tool}`, dropKind && 'is-dropping')}
      onMouseMove={(e) => {
        mouse.current = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      }}
      onMouseLeave={() => (mouse.current = null)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        const item = e.dataTransfer.items[0];
        const kind = item?.type.startsWith('audio/') ? 'Audio' : item?.type.startsWith('image/') ? 'Image' : item?.type.startsWith('video/') ? 'Video' : item?.type === 'application/pdf' ? 'Document' : 'card';
        setDropKind(kind);
      }}
      onDragLeave={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as globalThis.Node)) setDropKind(null);
      }}
      onDrop={(e) => {
        setDropKind(null);
        const files = [...e.dataTransfer.files].filter((f) => fileKind(f));
        const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        if (files.length || e.dataTransfer.getData('text/plain')) {
          e.preventDefault();
          capture.fromData(e.dataTransfer, at);
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onDragStart}
        onNodeDrag={onDrag}
        onNodeDragStop={onDragStop}
        onConnect={(c) => c.source && c.target && useBoard.getState().addLink(c.source, c.target)}
        onConnectEnd={connectOnDrop}
        onDelete={({ nodes: ns, edges: es }) => useBoard.getState().removeIds([...ns.filter((n) => n.type !== 'ghost').map((n) => n.id), ...es.map((e) => e.id)])}
        onNodeDoubleClick={(_, n) => n.type === 'card' && onOpenPanel(n.id)}
        onPaneClick={(e) => {
          if (tool === 'section') {
            useBoard.getState().addSection(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
            setTool('select');
          }
        }}
        attributionPosition="top-right"
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift', 'Meta']}
        selectionOnDrag={tool === 'select'}
        panOnDrag={tool === 'select' ? [1, 2] : true}
        panOnScroll
        zoomOnPinch
        minZoom={0.15}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
        nodesConnectable
        elevateNodesOnSelect={false}
        onlyRenderVisibleElements={board.cards.length > 150}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.3} color="var(--dot)" />
        <MiniMap className="minimap" pannable zoomable nodeColor={(n) => (n.type === 'section' ? 'var(--section-line)' : 'var(--line-2)')} maskColor="color-mix(in srgb, var(--paper) 70%, transparent)" nodeBorderRadius={4} />
      </ReactFlow>
      {dropKind && (
        <div className="drop-hint">
          <span>Drop to add as {dropKind} card</span>
        </div>
      )}
      {onEmptyHint && board.cards.length === 0 && board.sections.length === 0 && <EmptyBoard />}
    </div>
  );
}

function EmptyBoard() {
  const storage = useBoard((s) => s.storage);
  const slug = useBoard((s) => s.slug);
  const rows: [string, string][] = [
    ['https://…', 'Link'],
    ['.png .jpg', 'Image'],
    ['.mp3 .wav', 'Audio'],
    ['.mp4 / YouTube', 'Video'],
    ['.pdf', 'Document'],
    ['$…$', 'Math'],
  ];
  return (
    <div className="empty-board">
      <h2 className="display">
        Paste or drop <em>anything</em> to start
      </h2>
      <p className="serif">A link, a photo, a paragraph, some code, an equation, an audio or video file, a PDF. Each one becomes the right card.</p>
      <div className="empty-rules">
        {rows.map(([i, o]) => (
          <div key={i} className="mono">
            <span>{i}</span> → {o}
          </div>
        ))}
      </div>
      <div className="empty-keys mono">
        <span>
          <kbd className="ui-kbd">⌘V</kbd> paste
        </span>
        <span>
          <kbd className="ui-kbd">N</kbd> new note
        </span>
        <span>
          <kbd className="ui-kbd">⌘K</kbd> all commands
        </span>
      </div>
      <p className="mono muted empty-path">
        Saves to {storage?.name} › {storage?.root}/{slug}/
      </p>
    </div>
  );
}

/** Zoom control: − 100% +, click the number to fit. */
export function ZoomControl() {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="zoom">
      <button type="button" onClick={() => rf.zoomOut()} aria-label="Zoom out">
        −
      </button>
      <button type="button" className="mono" onClick={() => rf.fitView({ padding: 0.08, duration: 300 })} title="Fit board">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={() => rf.zoomIn()} aria-label="Zoom in">
        +
      </button>
    </div>
  );
}

/** Centres the view on a card and selects it (used by search results and `?card=`). */
export function useFocusCard() {
  const rf = useReactFlow();
  return useCallback(
    (id: string) => {
      const c = useBoard.getState().board?.cards.find((x) => x.id === id);
      if (!c) return;
      useBoard.getState().select([id]);
      rf.setCenter(c.x + c.w / 2, c.y + 60, { zoom: Math.max(rf.getZoom(), 1), duration: 400 });
    },
    [rf],
  );
}
