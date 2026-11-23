import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { STORAGE_BADGE, type StorageKind, type Visibility } from '@specimen/schema';
import { cx } from '../../lib/format';
import { Icon, type IconName } from './Icon';

export { Icon, GitHubMark } from './Icon';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** @default 'secondary' */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
});

/** The wordmark, set in the display face. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="ui-logo" style={{ fontSize: size }}>
      Specimen
    </span>
  );
}

/** Upper-case mono label ("NOTE", "1 · CAPTURE"). */
export function Label({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'accent' | 'hot' | 'muted' }) {
  return <span className={cx('sp-label', tone && `tone-${tone}`, className)}>{children}</span>;
}

/** Visibility pill: Draft / Published / Unlisted. */
export function VisibilityPill({ v }: { v: Visibility }) {
  return <span className={cx('ui-pill', `ui-pill--${v}`)}>{v[0].toUpperCase() + v.slice(1)}</span>;
}

/** Status pill used on fact cards: "verified" / "unverified". */
export function Tag({ tone = 'muted', children }: { tone?: 'ok' | 'warn' | 'muted' | 'accent' | 'hot'; children: ReactNode }) {
  return <span className={cx('ui-tag', `ui-tag--${tone}`)}>{children}</span>;
}

/** Two-letter storage badge ("GD", "R2"). */
export function StorageBadge({ kind }: { kind: StorageKind }) {
  return <span className="ui-sbadge">{STORAGE_BADGE[kind]}</span>;
}

/** Coloured dot + text: Saved (green), Saving (amber), Reconnect (red), Offline (gray). */
export function StatusDot({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'muted'; children: ReactNode }) {
  return (
    <span className={cx('ui-status', `ui-status--${tone}`)}>
      <i />
      {children}
    </span>
  );
}

export function Avatar({ text, size = 36 }: { text: string; size?: number }) {
  return (
    <span className="ui-avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {text}
    </span>
  );
}

/** Segmented control (All / Published / Drafts…, Canvas / Log). */
export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('ui-seg', size === 'sm' && 'ui-seg--sm')} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(function Input({ className, mono, ...rest }, ref) {
  return <input ref={ref} className={cx('ui-input', mono && 'ui-input--mono', className)} {...rest} />;
});

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('ui-field', className)}>
      <span className="ui-field-label">{label}</span>
      {children}
      {hint && <span className="ui-field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="ui-toggle" onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}

/**
 * Modal dialog on a dimmed backdrop. Closes on Escape and backdrop click.
 * Focus moves into the dialog on open.
 */
export function Dialog({ open, onClose, children, width = 560, className, label }: { open: boolean; onClose: () => void; children: ReactNode; width?: number; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ui-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal aria-label={label} tabIndex={-1} className={cx('ui-dialog', className)} style={{ width }}>
        {children}
      </div>
    </div>
  );
}

/** Thin progress bar (storage usage, uploads). */
export function Meter({ value, tone = 'ink' }: { value: number; tone?: 'ink' | 'accent' | 'danger' }) {
  return (
    <span className={cx('ui-meter', `ui-meter--${tone}`)}>
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

export function Spinner() {
  return <span className="ui-spinner" aria-label="Loading" />;
}

/** The small colour square that identifies a card type (menus, ⌘K, log). */
export function TypeMark({ type }: { type: string }) {
  return <i className="ui-mark" style={{ background: `var(--t-${type}, var(--faint))` }} aria-hidden />;
}
