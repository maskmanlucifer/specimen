import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { buildStory, CARD_LABEL, formatBytes, formatTime, hostOf, type Board, type Card, type CardOf, type Footnote, type StoryBlock } from '@specimen/schema';
import { FrameFigure, StoryFigure } from './Figure';
import { Code } from './parts/Code';
import { TeX } from './parts/TeX';
import { Waveform } from './parts/Waveform';
import { useMedia } from './StoryContext';

export type StoryTab = 'story' | 'board' | 'index';

/** Italicises the last word of the title in the accent colour, as in the 1c design. */
function Title({ text }: { text: string }) {
  const i = text.trim().lastIndexOf(' ');
  if (i < 0) return <h1 className="st-title">{text}</h1>;
  return (
    <h1 className="st-title">
      {text.slice(0, i)} <em>{text.slice(i + 1)}</em>
    </h1>
  );
}

function Sup({ n }: { n?: number }) {
  return n ? (
    <sup className="st-fn-ref">
      <a href={`#fn-${n}`}>{n}</a>
    </sup>
  ) : null;
}

function AudioBlock({ card }: { card: CardOf<'audio'> }) {
  const media = useMedia();
  const ref = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const dur = card.duration ?? 1;
  return (
    <div className="st-audio">
      <button type="button" className="st-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? ref.current?.pause() : ref.current?.play())}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="st-audio-body">
        <div className="st-audio-title">{card.title}</div>
        <Waveform peaks={card.peaks ?? []} duration={dur} markers={card.markers} progress={t / dur} onSeek={(p) => ref.current && (ref.current.currentTime = p * dur)} />
        <div className="st-audio-meta">
          {formatTime(t)} / {formatTime(dur)}
          {card.markers.map((m) => (
            <button key={m.id} type="button" onClick={() => ref.current && ((ref.current.currentTime = m.t), ref.current.play())}>
              {formatTime(m.t, false)} {m.label}
            </button>
          ))}
        </div>
      </div>
      <audio ref={ref} src={media(card.src)} preload="metadata" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    </div>
  );
}

function videoEmbed(src: string): string | null {
  const yt = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = src.match(/vimeo\.com\/(\d+)/);
  return vm ? `https://player.vimeo.com/video/${vm[1]}` : null;
}

/** Image that turns into a labelled hatched plate when the file is missing, instead of a broken-image icon. */
function StoryImage({ src, alt, name }: { src?: string; alt: string; name?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div className="st-image-missing" role="img" aria-label={alt || name}>
        <span>{name}</span>
      </div>
    );
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

/** One card rendered as editorial prose or an inline element. */
function Block({ block }: { block: Extract<StoryBlock, { kind: 'card' }> }) {
  const media = useMedia();
  const { card, footnote } = block;
  switch (card.type) {
    case 'note':
      return (
        <p className="st-p">
          {card.text}
          <Sup n={footnote} />
        </p>
      );
    case 'fact':
      return (
        <p className="st-p st-fact">
          {card.text}
          <Sup n={footnote} />
          {!card.verified && <span className="st-unverified" title="Not verified yet"> (unverified)</span>}
        </p>
      );
    case 'question':
      return <aside className="st-question">{card.text}</aside>;
    case 'quote':
      return (
        <blockquote className="st-quote">
          <p>“{card.text}”</p>
          {card.cite && <cite>— {card.cite}</cite>}
          <Sup n={footnote} />
        </blockquote>
      );
    case 'math':
      return (
        <div className="st-math">
          <TeX tex={card.tex} display />
        </div>
      );
    case 'code':
      return (
        <figure className="st-code">
          <div className="st-code-head">
            <span>{card.lang}</span>
            <Sup n={footnote} />
          </div>
          <Code code={card.code} highlightLines={card.highlight} />
        </figure>
      );
    case 'image':
      return (
        <figure className="st-image">
          <StoryImage src={media(card.src)} alt={card.alt ?? card.caption ?? ''} name={card.src.split('/').pop()} />
          {card.caption && (
            <figcaption>
              {card.caption}
              <Sup n={footnote} />
            </figcaption>
          )}
        </figure>
      );
    case 'audio':
      return <AudioBlock card={card} />;
    case 'video': {
      const embed = videoEmbed(card.src);
      return (
        <figure className="st-video">
          {embed ? <iframe src={embed} title={card.title} allow="encrypted-media; picture-in-picture" allowFullScreen /> : <video src={media(card.src)} poster={media(card.poster)} controls preload="metadata" />}
          <figcaption>{card.title}</figcaption>
        </figure>
      );
    }
    case 'document':
      return (
        <a className="st-doc" href={media(card.src)} target="_blank" rel="noreferrer">
          <span className="st-doc-badge">PDF</span>
          <span>
            <strong>{card.title}</strong>
            <small>{[card.pages && `${card.pages} pages`, card.size && formatBytes(card.size)].filter(Boolean).join(' · ')}</small>
          </span>
        </a>
      );
    case 'link':
      return (
        <a className="st-link" href={card.url} target="_blank" rel="noreferrer">
          <strong>{card.title ?? card.url}</strong>
          <small>{card.site ?? hostOf(card.url)} ↗</small>
        </a>
      );
    default:
      return null;
  }
}

function Footnotes({ notes }: { notes: Footnote[] }) {
  if (!notes.length) return null;
  return (
    <section className="st-footnotes" aria-label="Sources">
      <div className="sp-label">Sources</div>
      <ol>
        {notes.map((f) => (
          <li key={f.n} id={`fn-${f.n}`}>
            <span className="st-fn-n">{f.n}</span>
            <span>
              {f.label}
              {f.locator && `, ${f.locator}`}
              {f.url && (
                <>
                  {' '}
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {hostOf(f.url)} ↗
                  </a>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Read-only board: cards as small boxes at their canvas positions, scaled to fit. */
function BoardView({ board }: { board: Board }) {
  const cards = board.cards.filter((c) => !c.private);
  const w = Math.max(...board.sections.map((s) => s.x + s.w), ...cards.map((c) => c.x + c.w), 400);
  const h = Math.max(...board.sections.map((s) => s.y + s.h), ...cards.map((c) => c.y + (c.h ?? 100)), 300);
  return (
    <div className="st-board" style={{ aspectRatio: `${w} / ${h}` }}>
      {board.sections.map((s, i) => (
        <div key={s.id} className="st-board-section" style={{ left: `${(s.x / w) * 100}%`, top: `${(s.y / h) * 100}%`, width: `${(s.w / w) * 100}%`, height: `${(s.h / h) * 100}%` }}>
          <span className="sp-label">
            {i + 1} · {s.title}
          </span>
        </div>
      ))}
      {cards.map((c) => (
        <div key={c.id} className="st-board-card" style={{ left: `${(c.x / w) * 100}%`, top: `${(c.y / h) * 100}%`, width: `${(c.w / w) * 100}%` }} title={CARD_LABEL[c.type]}>
          <span className="sp-label">{CARD_LABEL[c.type]}</span>
          {c.type === 'figure' ? <FrameFigure board={board} card={c} interactive={false} /> : <span className="st-board-text">{'text' in c ? c.text : 'title' in c ? c.title : c.type === 'math' ? <TeX tex={c.tex} /> : c.type === 'code' ? c.lang : ''}</span>}
        </div>
      ))}
    </div>
  );
}

function IndexView({ board, onJump }: { board: Board; onJump: (sectionId: string) => void }) {
  const story = useMemo(() => buildStory(board), [board]);
  return (
    <div className="st-index">
      {story.sections.map((s) => (
        <section key={s.section.id}>
          <button type="button" className="st-index-h" onClick={() => onJump(s.section.id)}>
            <span className="sp-label">§ {s.n}</span> {s.section.title}
          </button>
          <ul>
            {s.blocks.map((b) => (
              <li key={b.card.id}>
                <span className="sp-label">{b.kind === 'figure' ? `Fig. ${b.figure}` : CARD_LABEL[b.card.type]}</span> {summaryOf(b.card)}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Footnotes notes={story.footnotes} />
    </div>
  );
}

function summaryOf(c: Card): string {
  if ('text' in c) return c.text.length > 90 ? `${c.text.slice(0, 90)}…` : c.text;
  if (c.type === 'figure') return c.caption ?? c.title ?? c.plugin;
  if ('title' in c && c.title) return c.title;
  if (c.type === 'math') return c.tex;
  if (c.type === 'code') return c.code.split('\n')[0];
  if (c.type === 'image') return c.caption ?? c.src;
  return '';
}

/** Height of one rail row; the list moves by whole rows so the active one sits in the middle. */
const RAIL_ROW = 30;

/**
 * Section rail beside the story (wide screens): follows the reader's scroll, keeps the active
 * section centred and fades the others by distance. Click a row to jump.
 */
function SectionRail({ sections }: { sections: { id: string; n: number; title: string }[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(`sec-${s.id}`)).filter((e): e is HTMLElement => !!e);
    // A section is active while it crosses a band just above the middle of the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(els.indexOf(e.target as HTMLElement));
      },
      { rootMargin: '-38% 0px -58% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);
  if (sections.length < 2) return null;
  return (
    <nav className="st-rail" aria-label="Sections">
      <ol style={{ transform: `translateY(${-active * RAIL_ROW}px)` }}>
        {sections.map((s, i) => {
          const d = Math.abs(i - active);
          return (
            <li key={s.id} style={{ opacity: d === 0 ? 1 : d === 1 ? 0.5 : d === 2 ? 0.26 : 0.1 }} aria-current={d === 0 ? 'true' : undefined}>
              <button type="button" onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <i />
                <span className="st-rail-n">§ {s.n}</span>
                {s.title}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The published story, concept 1c "Editorial Longread": big display type, generous whitespace,
 * figures break out wide on a dark plate. Tabs switch to the board and an index.
 */
export function Story({ board, tab: tabProp, onTab, rail = true }: { board: Board; tab?: StoryTab; onTab?: (t: StoryTab) => void; /** Show the section rail. @default true */ rail?: boolean }) {
  const story = useMemo(() => buildStory(board), [board]);
  const [tabState, setTabState] = useState<StoryTab>('story');
  const tab = tabProp ?? tabState;
  const setTab = onTab ?? setTabState;
  const jump = (id: string) => {
    setTab('story');
    requestAnimationFrame(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth' }));
  };

  return (
    <article className="st">
      <header className="st-bar">
        <span className="sp-label">
          {[story.author, `${story.minutes} min read`].filter(Boolean).join(' · ')}
        </span>
        <nav className="st-tabs" aria-label="View">
          {(['story', 'board', 'index'] as const).map((t) => (
            <button key={t} type="button" aria-current={tab === t} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'story' && (
        <>
          {rail && <SectionRail sections={story.sections.map((s) => ({ id: s.section.id, n: s.n, title: s.section.title }))} />}
          <div className="st-col st-head">
            <Title text={story.title} />
            {story.dek && <p className="st-dek">{story.dek}</p>}
          </div>
          {story.sections.map((s) => (
            <section key={s.section.id} id={`sec-${s.section.id}`} className="st-section">
              <div className="st-col">
                <div className="sp-label st-section-label">
                  § {s.n} · {s.section.title}
                </div>
                <h2 className="st-h2">{s.section.title}</h2>
                {s.section.intro && <p className="st-p st-intro">{s.section.intro}</p>}
              </div>
              {s.blocks.map((b) => (
                <Fragment key={b.card.id}>
                  {b.kind === 'figure' ? (
                    <StoryFigure board={board} card={b.card} n={b.figure} />
                  ) : (
                    <div className="st-col">
                      <Block block={b} />
                    </div>
                  )}
                </Fragment>
              ))}
              {s.related.length > 0 && (
                <div className="st-col st-related">
                  {s.related.map((r) => (
                    <button key={r.sectionId} type="button" className="st-chip" onClick={() => jump(r.sectionId)}>
                      ↔ {r.title}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
          <div className="st-col">
            <Footnotes notes={story.footnotes} />
          </div>
        </>
      )}
      {tab === 'board' && (
        <div className="st-wide">
          <BoardView board={board} />
        </div>
      )}
      {tab === 'index' && (
        <div className="st-col">
          <IndexView board={board} onJump={jump} />
        </div>
      )}
      <footer className="st-foot">
        <a href="https://github.com/specimen-dev/specimen" target="_blank" rel="noreferrer">
          Made with Specimen (open source)
        </a>
      </footer>
    </article>
  );
}
