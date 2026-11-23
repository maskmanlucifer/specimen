import type { PluginBundle } from '@specimen/schema';

/**
 * Messages between the host page and a plugin iframe.
 *
 * Host → guest: `update` (settings, inputs, step, theme), `still` (request a PNG).
 * Guest → host: `ready`, `steps`, `height`, `log`, `error`, `still`.
 */
export type HostMessage =
  | { type: 'update'; settings: Record<string, unknown>; inputs: Record<string, PluginInputData>; step: number; theme: 'light' | 'dark'; playing: boolean }
  | { type: 'still' };

export type GuestMessage =
  | { type: 'ready' }
  | { type: 'steps'; n: number }
  | { type: 'step'; n: number }
  | { type: 'height'; h: number }
  | { type: 'log'; level: 'log' | 'warn' | 'error'; text: string }
  | { type: 'error'; text: string }
  | { type: 'still'; dataUrl: string | null };

/** What a plugin receives for one linked input card. Media arrives as bytes: the sandbox has no network. */
export interface PluginInputData {
  cardType: string;
  title?: string;
  text?: string;
  bytes?: ArrayBuffer;
  duration?: number;
}

/**
 * The guest-side API, available to `figure.js` as the global `specimen`:
 *
 * ```js
 * specimen.render(({ root, settings, inputs, step, theme, width }) => { ... });
 * specimen.setSteps(6);                 // enables ◀ PREV / ▶ PLAY / NEXT ▶
 * const buf = await specimen.audio('audio'); // decoded AudioBuffer of the linked audio card
 * specimen.still = () => svgOrCanvasElement; // optional: what to export as the still image
 * ```
 */
const GUEST = `
(() => {
  const post = (m) => parent.postMessage(m, '*');
  const root = document.getElementById('root');
  let renderFn = null, state = null, audioCache = {};
  const fmt = (a) => a.map((x) => typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })()).join(' ');
  for (const level of ['log', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...a) => { orig(...a); post({ type: 'log', level, text: fmt(a) }); };
  }
  addEventListener('error', (e) => post({ type: 'error', text: e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '') }));
  addEventListener('unhandledrejection', (e) => post({ type: 'error', text: String(e.reason && e.reason.message || e.reason) }));
  const draw = () => {
    if (!renderFn || !state) return;
    try {
      renderFn({ root, ...state, width: root.clientWidth, height: root.clientHeight });
    } catch (e) { post({ type: 'error', text: e.message }); }
  };
  window.specimen = {
    render(fn) { renderFn = fn; draw(); },
    setSteps(n) { post({ type: 'steps', n }); },
    goTo(n) { post({ type: 'step', n }); },
    async audio(key) {
      const input = state && state.inputs[key];
      if (!input || !input.bytes) return null;
      if (!audioCache[key] || audioCache[key].src !== input.bytes) {
        const ctx = new OfflineAudioContext(1, 1, 44100);
        audioCache[key] = { src: input.bytes, buf: await ctx.decodeAudioData(input.bytes.slice(0)) };
      }
      return audioCache[key].buf;
    },
    still: null,
  };
  addEventListener('message', async (e) => {
    const m = e.data;
    if (m.type === 'update') {
      state = m;
      document.documentElement.dataset.theme = m.theme;
      draw();
    } else if (m.type === 'still') {
      try {
        const el = (window.specimen.still && window.specimen.still()) || root.querySelector('canvas, svg');
        let url = null;
        if (el instanceof HTMLCanvasElement) url = el.toDataURL('image/png');
        else if (el instanceof SVGElement) url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(el));
        post({ type: 'still', dataUrl: url });
      } catch (err) { post({ type: 'still', dataUrl: null }); }
    }
  });
  new ResizeObserver(() => { draw(); post({ type: 'height', h: document.body.scrollHeight }); }).observe(root);
  post({ type: 'ready' });
})();
`;

/** Base styles every figure gets, using the same tokens as the host so themes match. */
const BASE_CSS = `
:root{--ink:#1a1a1a;--ink-2:#4a4a4a;--muted:#6b6b6b;--faint:#a69f93;--line:#e7e3dc;--paper:#faf8f4;--surface:#fff;--accent:#1f6f6b;--hot:#e4572e;--grid:#efebe4;color-scheme:light}
:root[data-theme=dark]{--ink:#ede8df;--ink-2:#c8c1b5;--muted:#a69f93;--faint:#5a544c;--line:#3a3631;--paper:#1b1916;--surface:#24211d;--accent:#5fb3ac;--hot:#f07a55;--grid:#2e2a25;color-scheme:dark}
html,body{margin:0;height:100%;background:transparent;color:var(--ink);font:12px/1.4 'JetBrains Mono',ui-monospace,monospace;overflow:hidden}
#root{position:absolute;inset:0}
`;

const escapeScript = (s: string) => s.replace(/<\/script/gi, '<\\/script');
const escapeStyle = (s: string) => s.replace(/<\/style/gi, '<\\/style');

/**
 * Builds the iframe document for a plugin. The CSP allows inline code (and eval, for plugins like
 * the function plot) but no network,
 * no remote images, no form posts. Combined with `sandbox="allow-scripts"` (no same-origin),
 * a plugin cannot read cookies, storage or the host page.
 */
export function pluginSrcDoc(bundle: PluginBundle): string {
  const csp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${BASE_CSS}${escapeStyle(bundle.style)}</style></head><body><div id="root"></div><script>${escapeScript(GUEST)}</script><script>${escapeScript(bundle.script)}</script></body></html>`;
}
