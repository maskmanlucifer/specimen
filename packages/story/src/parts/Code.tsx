import { highlight } from 'sugar-high';
import { useMemo } from 'react';

/**
 * Highlighted code with optional highlighted lines. `sugar-high` is ~1 KB and language-agnostic,
 * which is enough for short research snippets.
 *
 * @param highlightLines - 1-based line numbers drawn with the accent bar.
 */
export function Code({ code, highlightLines = [], className }: { code: string; highlightLines?: number[]; className?: string }) {
  const lines = useMemo(() => highlight(code).split('\n'), [code]);
  return (
    <pre className={`sp-code ${className ?? ''}`}>
      <code>
        {lines.map((l, i) => (
          <span key={i} className={highlightLines.includes(i + 1) ? 'sp-code-line is-hl' : 'sp-code-line'} dangerouslySetInnerHTML={{ __html: l || ' ' }} />
        ))}
      </code>
    </pre>
  );
}
