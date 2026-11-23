import { useEffect, useMemo, useRef, useState } from 'react';
import { settingsWithDefaults, type PluginBundle } from '@specimen/schema';
import { pluginSrcDoc, type GuestMessage, type HostMessage, type PluginInputData } from './runtime';

export interface PluginFrameHandle {
  /** Asks the figure for a still image (PNG or SVG data URL). */
  still(): Promise<string | null>;
}

export interface PluginFrameProps {
  bundle: PluginBundle;
  settings: Record<string, unknown>;
  inputs?: Record<string, PluginInputData>;
  /** 0-based step for stepped figures. */
  step?: number;
  playing?: boolean;
  theme?: 'light' | 'dark';
  height?: number;
  className?: string;
  /** Exposes {@link PluginFrameHandle} to the parent. */
  handleRef?: React.MutableRefObject<PluginFrameHandle | null>;
  onSteps?: (n: number) => void;
  onStep?: (n: number) => void;
  /** Console output and errors from the plugin (the plugin editor shows these). */
  onLog?: (m: Extract<GuestMessage, { type: 'log' | 'error' }>) => void;
  /** Whether the figure receives pointer events (off while dragging cards on the canvas). */
  interactive?: boolean;
}

/**
 * Runs a plugin figure in a sandboxed iframe and keeps it in sync with props.
 * The iframe is rebuilt only when the plugin source changes; settings and inputs are posted.
 */
export function PluginFrame({ bundle, settings, inputs = {}, step = 0, playing = false, theme = 'light', height, className, handleRef, onSteps, onStep, onLog, interactive = true }: PluginFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const srcDoc = useMemo(() => pluginSrcDoc(bundle), [bundle.script, bundle.style]); // eslint-disable-line react-hooks/exhaustive-deps
  const cb = useRef({ onSteps, onStep, onLog });
  cb.current = { onSteps, onStep, onLog };
  const stillWaiters = useRef<((v: string | null) => void)[]>([]);

  useEffect(() => setReady(false), [srcDoc]);

  useEffect(() => {
    const onMessage = (e: MessageEvent<GuestMessage>) => {
      if (e.source !== ref.current?.contentWindow) return;
      const m = e.data;
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'steps') cb.current.onSteps?.(m.n);
      else if (m.type === 'step') cb.current.onStep?.(m.n);
      else if (m.type === 'log' || m.type === 'error') cb.current.onLog?.(m);
      else if (m.type === 'still') stillWaiters.current.splice(0).forEach((r) => r(m.dataUrl));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const merged = useMemo(() => settingsWithDefaults(bundle.manifest, settings), [bundle.manifest, settings]);

  useEffect(() => {
    if (!ready) return;
    const msg: HostMessage = { type: 'update', settings: merged, inputs, step, theme, playing };
    ref.current?.contentWindow?.postMessage(msg, '*');
  }, [ready, merged, inputs, step, theme, playing]);

  if (handleRef)
    handleRef.current = {
      still: () =>
        new Promise((resolve) => {
          stillWaiters.current.push(resolve);
          ref.current?.contentWindow?.postMessage({ type: 'still' } satisfies HostMessage, '*');
          setTimeout(() => resolve(null), 3000);
        }),
    };

  // The iframe's color-scheme must match its document's, or Chrome paints an opaque backdrop
  // behind the transparent figure (visible as a dark box on the story's plate).
  return (
    <iframe
      ref={ref}
      className={className}
      title={bundle.manifest.name}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      style={{ width: '100%', height: height ?? bundle.manifest.height, border: 0, display: 'block', pointerEvents: interactive ? 'auto' : 'none', colorScheme: theme }}
    />
  );
}
