import { useEffect } from 'react';

/** Milliseconds per step while playing. */
const STEP_MS = 1100;

/**
 * Plays through steps: advances every {@link STEP_MS} and stops at the end.
 * Figures never auto-play; playback starts only from a user action.
 */
export function usePlayback(step: number, steps: number, playing: boolean, setStep: (n: number) => void, setPlaying: (p: boolean) => void) {
  useEffect(() => {
    if (!playing) return;
    if (step >= steps - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep(step + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step, steps, setStep, setPlaying]);
}

interface StepperProps {
  step: number;
  steps: number;
  playing: boolean;
  onStep: (n: number) => void;
  onPlay: (p: boolean) => void;
}

/** The figure control bar from the design: `◀ PREV | ▶ PLAY | NEXT ▶ ……… STEP 3 / 6`. */
export function StepBar({ step, steps, playing, onStep, onPlay }: StepperProps) {
  return (
    <div className="sp-stepbar">
      <button type="button" onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0}>
        ◀ Prev
      </button>
      <button type="button" onClick={() => (step >= steps - 1 ? (onStep(0), onPlay(true)) : onPlay(!playing))}>
        {playing ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button type="button" onClick={() => onStep(Math.min(steps - 1, step + 1))} disabled={step >= steps - 1}>
        Next ▶
      </button>
      <span className="sp-stepbar-count">
        Step {step + 1} / {steps}
      </span>
    </div>
  );
}

/** The editorial variant used on the dark figure plate: round play button, scrubber, `3 / 6`. */
export function StepScrubber({ step, steps, playing, onStep, onPlay }: StepperProps) {
  return (
    <div className="sp-scrubber">
      <button type="button" className="sp-scrubber-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (step >= steps - 1 ? (onStep(0), onPlay(true)) : onPlay(!playing))}>
        {playing ? '❚❚' : '▶'}
      </button>
      <input type="range" min={0} max={Math.max(0, steps - 1)} value={step} onChange={(e) => onStep(Number(e.target.value))} aria-label="Step" />
      <span>
        {step + 1} / {steps}
      </span>
    </div>
  );
}
