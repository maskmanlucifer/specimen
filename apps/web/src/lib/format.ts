/** "12 min", "1 h", "Yday", "2 d", "2 wk" — the compact style of the activity list. */
export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'Yday';
  if (s < 1209600) return `${Math.floor(s / 86400)} d`;
  return `${Math.floor(s / 604800)} wk`;
}

/** "edited 12 min ago", "edited yesterday", "edited 2 weeks ago" — the board card style. */
export function editedAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'edited just now';
  if (s < 3600) return `edited ${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `edited ${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'edited yesterday';
  if (s < 604800) return `edited ${Math.floor(s / 86400)} days ago`;
  const w = Math.floor(s / 604800);
  return `edited ${w} week${w > 1 ? 's' : ''} ago`;
}

/** Two-letter initials for the avatar. */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** `a.b.c` → classnames, skipping falsy parts. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
