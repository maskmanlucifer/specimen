import { useEffect, useRef, useState } from 'react';
import { CARD_LABEL, formatBytes, formatTime, hostOf, type Board, type Card, type CardOf } from '@specimen/schema';
import { Code, FrameFigure, TeX, useMedia, useStoryEnv, Waveform } from '@specimen/story';
import { Icon, Tag } from '../../components/ui';
import { useBoard } from '../../store/board';

function Head({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="card-head">
      <span className="sp-label">{left}</span>
      {right && <span className="card-head-r">{right}</span>}
    </div>
  );
}

/**
 * Plain text that becomes a textarea on double-click. Commits on blur or ⌘↵; Escape cancels.
 * `nodrag` stops the canvas from dragging the card while selecting text.
 */
function EditableText({ card, className }: { card: CardOf<'note' | 'fact' | 'question' | 'quote'>; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const updateCard = useBoard((s) => s.updateCard);
  useEffect(() => {
    if (editing) {
      setDraft(card.text);
      requestAnimationFrame(() => ref.current?.select());
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== card.text) updateCard(card.id, { text: draft.trim() }, `Edited ${card.type}: ${draft.trim().slice(0, 80)}`);
  };
  if (!editing)
    return (
      <p className={className} onDoubleClick={() => setEditing(true)}>
        {card.text || <span className="muted">Double-click to write</span>}
      </p>
    );
  return (
    <textarea
      ref={ref}
      className={`card-textarea nodrag nowheel ${className ?? ''}`}
      value={draft}
      rows={Math.max(2, draft.split('\n').length)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') setEditing(false);
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
      }}
    />
  );
}

function SourceLine({ card }: { card: Card }) {
  if (!card.source?.url && !card.source?.label) return null;
  const host = hostOf(card.source.url);
  return (
    <div className="card-source mono">
      {host && <span className="card-favicon">{host[0]?.toUpperCase()}</span>}
      {card.source.label && !host ? card.source.label : host}
      {card.source.locator && ` · ${card.source.locator}`}
    </div>
  );
}

/** Hatched placeholder for missing or loading media, with the file name in mono. */
function Hatch({ label, height = 92 }: { label?: string; height?: number }) {
  return (
    <div className="card-hatch" style={{ height }}>
      {label && <span className="mono">{label}</span>}
    </div>
  );
}

function AudioBody({ card }: { card: CardOf<'audio'> }) {
  const media = useMedia();
  const ref = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const dur = card.duration ?? 1;
  return (
    <>
      <Head left="Audio" right={card.markers.length ? `${card.markers.length} marker${card.markers.length > 1 ? 's' : ''}` : undefined} />
      <div className="card-title">{card.title}</div>
      <div className="card-audio nodrag">
        <button type="button" className="card-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? ref.current?.pause() : ref.current?.play().catch(() => undefined))}>
          <Icon name={playing ? 'pause' : 'play'} size={12} />
        </button>
        <Waveform peaks={card.peaks ?? []} duration={dur} markers={card.markers} progress={t / dur} onSeek={(p) => ref.current && (ref.current.currentTime = p * dur)} />
      </div>
      <div className="card-time mono">
        {formatTime(t)} / {formatTime(dur)}
      </div>
      <audio
        ref={ref}
        src={media(card.src)}
        preload="none"
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setT(a.currentTime);
          if (card.loop && a.currentTime >= card.loop.end) a.currentTime = card.loop.start;
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </>
  );
}

function VideoBody({ card }: { card: CardOf<'video'> }) {
  const media = useMedia();
  const [play, setPlay] = useState(false);
  const yt = card.src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/)?.[1];
  return (
    <>
      <div className="card-video">
        <span className="sp-label card-video-label">Video</span>
        {play ? (
          yt ? (
            <iframe className="nodrag" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`} title={card.title} allow="autoplay; encrypted-media" />
          ) : (
            <video className="nodrag" src={media(card.src)} autoPlay controls />
          )
        ) : (
          <>
            {yt && <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" />}
            <button type="button" className="card-video-play nodrag" aria-label="Play video" onClick={() => setPlay(true)}>
              <Icon name="play" size={14} />
            </button>
          </>
        )}
        {card.duration && !play && <span className="card-video-dur mono">{formatTime(card.duration, false)}</span>}
      </div>
      <div className="card-video-foot">
        {card.title}
        {card.size ? <span className="mono"> · {formatBytes(card.size)}</span> : null}
      </div>
    </>
  );
}

/** Fig. numbers follow the story order, so the canvas and the published page agree. */
function FigureBody({ card, board, n }: { card: CardOf<'figure'>; board: Board; n?: number }) {
  const env = useStoryEnv();
  const bundle = env.plugins[card.plugin];
  const input = Object.values(card.inputs)[0];
  const inputCard = board.cards.find((c) => c.id === input);
  return (
    <>
      <div className="card-fig-head">
        <span className="sp-label">
          Fig. {n ?? '–'} · {card.title ?? bundle?.manifest.name ?? card.plugin}
        </span>
        {inputCard && 'src' in inputCard && <span className="mono card-fig-input">{inputCard.src.split('/').pop()}</span>}
      </div>
      <FrameFigure board={board} card={card} n={n} />
      {card.caption && <div className="card-fig-caption serif">{card.caption}</div>}
    </>
  );
}

/** The body of one card on the canvas, by type. */
export function CardBody({ card, board, figureNo }: { card: Card; board: Board; figureNo?: number }) {
  const media = useMedia();
  switch (card.type) {
    case 'note':
      return (
        <>
          <Head left="Note" />
          <EditableText card={card} className="card-text" />
          <SourceLine card={card} />
        </>
      );
    case 'fact':
      return (
        <>
          <Head left="Fact" right={<Tag tone={card.verified ? 'ok' : 'warn'}>{card.verified ? 'verified' : 'unverified'}</Tag>} />
          <EditableText card={card} className="card-text" />
          <SourceLine card={card} />
        </>
      );
    case 'question':
      return (
        <>
          <Head left="Question" />
          <EditableText card={card} className="card-text card-question" />
        </>
      );
    case 'quote':
      return (
        <>
          <Head left="Quote" />
          <EditableText card={card} className="card-text card-quote" />
          {card.cite && <div className="card-source mono">— {card.cite}</div>}
        </>
      );
    case 'link':
      return (
        <>
          {card.image ? <img className="card-img" src={media(card.image)} alt="" /> : <Hatch height={64} />}
          <div className="card-pad">
            <div className="card-title">{card.title ?? card.url}</div>
            <div className="card-source mono">
              <span className="card-favicon">{(card.site ?? hostOf(card.url))[0]?.toUpperCase()}</span>
              {card.site ?? hostOf(card.url)}
            </div>
          </div>
        </>
      );
    case 'image':
      return (
        <>
          <ImageOrHatch src={media(card.src)} name={card.src.split('/').pop()} alt={card.alt ?? card.caption ?? ''} />
          {card.caption && <div className="card-pad card-caption">{card.caption}</div>}
        </>
      );
    case 'audio':
      return <AudioBody card={card} />;
    case 'video':
      return <VideoBody card={card} />;
    case 'document':
      return (
        <div className="card-doc">
          <div className="card-doc-page">
            <span>PDF</span>
          </div>
          <div>
            <div className="card-title">{card.title}</div>
            {card.pages && <div className="card-source mono">{card.pages} pages</div>}
          </div>
        </div>
      );
    case 'code':
      return (
        <>
          <Head left="Code" right={<span className="mono">{card.lang}</span>} />
          <Code code={card.code} highlightLines={card.highlight} className="card-code" />
        </>
      );
    case 'math':
      return (
        <>
          <Head left="Math" />
          <div className="card-math">
            <TeX tex={card.tex} />
          </div>
        </>
      );
    case 'figure':
      return <FigureBody card={card} board={board} n={figureNo} />;
  }
}

function ImageOrHatch({ src, name, alt }: { src?: string; name?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Hatch label={name} />;
  return <img className="card-img" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export { CARD_LABEL };
