import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'specimen-theme';
const MOTION_KEY = 'specimen-motion';

function resolve(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;
}

function read(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Theme preference stored per browser. `index.html` applies it before first paint;
 * this hook keeps `<html data-theme>` in sync and follows the OS when set to `system`.
 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => read(KEY, 'system') as ThemePref);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => resolve(pref));

  useEffect(() => {
    const apply = () => {
      const t = resolve(pref);
      setTheme(t);
      document.documentElement.dataset.theme = t;
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);

  const set = (p: ThemePref) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* private mode: the choice lasts for this tab only */
    }
    setPref(p);
  };
  return { pref, theme, setPref: set };
}

/** Reduce-motion override: `system` follows the OS, `on` reduces always, `off` never. */
export function useMotionPref() {
  const [pref, setPref] = useState(() => read(MOTION_KEY, 'system') as 'system' | 'on' | 'off');
  useEffect(() => {
    if (pref === 'on') document.documentElement.dataset.motion = 'reduce';
    else if (pref === 'off') document.documentElement.dataset.motion = 'on';
    else delete document.documentElement.dataset.motion;
  }, [pref]);
  return {
    pref,
    set: (p: 'system' | 'on' | 'off') => {
      try {
        localStorage.setItem(MOTION_KEY, p);
      } catch {
        /* ignore */
      }
      setPref(p);
    },
  };
}
