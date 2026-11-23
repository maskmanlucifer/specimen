import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TypeMark } from './ui';
import './morph-tag.css';

/** Words the hero chip cycles through, each with the card type it becomes. */
const WORDS: { type: string; word: string }[] = [
  { type: 'note', word: 'notes' },
  { type: 'link', word: 'sources' },
  { type: 'image', word: 'photos' },
  { type: 'audio', word: 'audio' },
  { type: 'code', word: 'code' },
  { type: 'math', word: 'equations' },
];

/**
 * Inline chip that morphs between words (after the "morphing tags" pattern): the chip width
 * animates to the next word, which blurs in while the last one blurs out. Holds still when the
 * reader prefers reduced motion.
 */
export function MorphTag({ interval = 2200 }: { interval?: number }) {
  const [i, setI] = useState(0);
  const [width, setWidth] = useState<number>();
  const measure = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), interval);
    return () => clearInterval(t);
  }, [interval]);

  // Width of the current word, measured from an invisible copy, so the chip can animate to it.
  useLayoutEffect(() => {
    setWidth(measure.current?.getBoundingClientRect().width);
  }, [i]);

  const w = WORDS[i];
  return (
    <span className="morph" style={{ width }} aria-live="off">
      <span ref={measure} className="morph-inner morph-measure" aria-hidden>
        <TypeMark type={w.type} />
        {w.word}
      </span>
      <span key={i} className="morph-inner morph-word">
        <TypeMark type={w.type} />
        {w.word}
      </span>
    </span>
  );
}
