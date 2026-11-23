import { useEffect, useState } from 'react';
import type { Board, CardOf } from '@specimen/schema';
import { PluginFrame } from './plugin/PluginFrame';
import type { PluginInputData } from './plugin/runtime';
import { StepBar, StepScrubber, usePlayback } from './plugin/Stepper';
import { defaultLoadInputs, useMedia, useStoryEnv } from './StoryContext';

/** Shared step state for a stepped figure. */
export function useSteps() {
  const [steps, setSteps] = useState(1);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  usePlayback(step, steps, playing, setStep, setPlaying);
  return { steps, setSteps, step, setStep, playing, setPlaying };
}

/** Resolves a figure card's inputs once per change of the linked cards. */
export function useFigureInputs(board: Board, card: CardOf<'figure'>) {
  const env = useStoryEnv();
  const [inputs, setInputs] = useState<Record<string, PluginInputData>>({});
  const key = JSON.stringify(card.inputs) + board.cards.filter((c) => Object.values(card.inputs).includes(c.id)).map((c) => c.updatedAt).join();
  useEffect(() => {
    let live = true;
    (env.loadInputs ?? ((b, i) => defaultLoadInputs(b, i, env.mediaUrl)))(board, card.inputs).then((v) => live && setInputs(v));
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return inputs;
}

/**
 * A numbered, interactive figure on the dark plate (1c Editorial). Falls back to the still
 * image when the plugin is missing, and the still is also in `<noscript>` for no-JS readers.
 */
export function StoryFigure({ board, card, n }: { board: Board; card: CardOf<'figure'>; n: number }) {
  const env = useStoryEnv();
  const media = useMedia();
  const bundle = env.plugins[card.plugin];
  const inputs = useFigureInputs(board, card);
  const s = useSteps();
  const stepped = bundle?.manifest.stepped && s.steps > 1;

  return (
    <figure className="st-figure">
      <div className="st-plate">
        <div className="st-plate-head">
          <span>
            Fig. {n} · {card.title ?? bundle?.manifest.name ?? card.plugin}
          </span>
        </div>
        {bundle ? (
          <PluginFrame bundle={bundle} settings={card.settings} inputs={inputs} step={s.step} playing={s.playing} theme="dark" onSteps={s.setSteps} onStep={s.setStep} height={Math.max(bundle.manifest.height, 300)} />
        ) : card.still ? (
          <img src={media(card.still)} alt={card.caption ?? ''} />
        ) : (
          <div className="st-plate-missing">Plugin “{card.plugin}” is not available.</div>
        )}
        {stepped && <StepScrubber step={s.step} steps={s.steps} playing={s.playing} onStep={s.setStep} onPlay={s.setPlaying} />}
        {card.still && (
          <noscript>
            <img src={media(card.still)} alt={card.caption ?? ''} />
          </noscript>
        )}
      </div>
      {card.caption && (
        <figcaption>
          <span className="st-figno">Fig. {n}</span> <em>{card.caption}</em>
        </figcaption>
      )}
    </figure>
  );
}

/** Compact framed figure (1b style) used on the canvas card and in the Board tab. */
export function FrameFigure({ board, card, n, interactive = true }: { board: Board; card: CardOf<'figure'>; n?: number; interactive?: boolean }) {
  const env = useStoryEnv();
  const bundle = env.plugins[card.plugin];
  const inputs = useFigureInputs(board, card);
  const s = useSteps();
  return (
    <div className="sp-frame-fig">
      {bundle ? <PluginFrame bundle={bundle} settings={card.settings} inputs={inputs} step={s.step} playing={s.playing} theme={env.theme} onSteps={s.setSteps} onStep={s.setStep} interactive={interactive} height={Math.min(bundle.manifest.height, 220)} /> : <div className="sp-frame-missing">{n ? `Fig. ${n} · ` : ''}plugin “{card.plugin}” not installed</div>}
      {bundle?.manifest.stepped && s.steps > 1 && <StepBar step={s.step} steps={s.steps} playing={s.playing} onStep={s.setStep} onPlay={s.setPlaying} />}
    </div>
  );
}
