import katex from 'katex';
import { useMemo } from 'react';

/**
 * Renders TeX with KaTeX. Bad TeX shows the source in red instead of throwing,
 * so a typo in one card never breaks the canvas or the story.
 */
export function TeX({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: display, throwOnError: false, errorColor: 'var(--hot)', output: 'html' }), [tex, display]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
