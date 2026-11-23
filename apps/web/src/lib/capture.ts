import type { CardType } from '@specimen/schema';
import type { NewCard } from '../store/board';

/** What pasted text becomes. Order matters: the first rule that matches wins. */
export function classifyText(raw: string): NewCard {
  const text = raw.trim();
  if (/^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/\d)/.test(text)) return { type: 'video', src: text, title: text.replace(/^https?:\/\/(www\.)?/, ''), x: 0, y: 0 };
  if (/^https?:\/\/\S+$/.test(text)) return { type: 'link', url: text, x: 0, y: 0 };
  const math = text.match(/^\$\$?([\s\S]+?)\$\$?$/);
  if (math) return { type: 'math', tex: math[1].trim(), x: 0, y: 0 };
  const fence = text.match(/^```(\w*)\n([\s\S]*?)\n?```$/);
  if (fence) return { type: 'code', lang: fence[1] || guessLang(fence[2]), code: fence[2], highlight: [], x: 0, y: 0 };
  if (looksLikeCode(text)) return { type: 'code', lang: guessLang(text), code: text, highlight: [], x: 0, y: 0 };
  if (/^["“].+["”]\s*(—|--|-)\s*.+$/s.test(text)) {
    const m = text.match(/^["“](.+)["”]\s*(?:—|--|-)\s*(.+)$/s)!;
    return { type: 'quote', text: m[1].trim(), cite: m[2].trim(), x: 0, y: 0 };
  }
  if (text.endsWith('?') && text.length < 240 && !text.includes('\n')) return { type: 'question', text, x: 0, y: 0 };
  return { type: 'note', text, x: 0, y: 0 };
}

/** Multi-line text with code punctuation and indentation, or one line that is clearly a statement. */
function looksLikeCode(t: string): boolean {
  const lines = t.split('\n');
  if (lines.length < 2) return /^(SELECT|import|const|let|def|function|class|#include)\b/.test(t) || /;\s*$/.test(t);
  const codey = lines.filter((l) => /[{}();=]|^\s{2,}\S|^\s*(def|for|if|return|import|SELECT|FROM|const|let|var|fn|pub)\b/.test(l)).length;
  return codey / lines.length > 0.5;
}

function guessLang(t: string): string {
  if (/\b(SELECT|FROM|WHERE|GROUP BY)\b/i.test(t)) return 'sql';
  if (/\bdef |:\s*$|\bimport \w+$|print\(/m.test(t)) return 'python';
  if (/\bfn |let mut|::/.test(t)) return 'rust';
  if (/\bfunc |:= /.test(t)) return 'go';
  if (/=>|const |let |function /.test(t)) return 'js';
  if (/^\s*[#$] /m.test(t)) return 'shell';
  return 'text';
}

/** Card type for a dropped file, or null when Specimen cannot show it. */
export function fileKind(file: File): CardType | null {
  const t = file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (t.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (t.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(ext)) return 'audio';
  if (t.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video';
  if (t === 'application/pdf' || ext === 'pdf') return 'document';
  if (t.startsWith('text/') || ['md', 'txt', 'csv'].includes(ext)) return 'note';
  return null;
}

/** Peaks for the waveform (96 bars) and the duration, decoded in the browser before upload. */
export async function analyseAudio(file: Blob, bars = 96): Promise<{ peaks: number[]; duration: number } | null> {
  if (file.size > 250 * 1024 * 1024) return null;
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.floor(data.length / bars) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = i * step; j < (i + 1) * step && j < data.length; j += 16) max = Math.max(max, Math.abs(data[j]));
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.01);
    return { peaks: peaks.map((p) => Math.round((p / top) * 100) / 100), duration: buf.duration };
  } catch {
    return null;
  }
}

/** Duration of a video file from its metadata. */
export function videoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve(Number.isFinite(v.duration) ? v.duration : undefined);
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => resolve(undefined);
    v.src = URL.createObjectURL(file);
  });
}

/** Page count of a PDF, by counting page objects. Good enough for the "7 pages" label. */
export async function pdfPages(file: File): Promise<number | undefined> {
  const head = await file.slice(0, Math.min(file.size, 8 * 1024 * 1024)).text();
  const n = head.match(/\/Type\s*\/Page[^s]/g)?.length;
  return n || undefined;
}

/** "What you pasted → what it became", shown in the capture help and toasts. */
export const PASTE_RULES: { in: string; out: string }[] = [
  { in: 'https://…', out: 'Link' },
  { in: '.png .jpg', out: 'Image' },
  { in: '.mp3 .wav', out: 'Audio' },
  { in: '.mp4 / YouTube', out: 'Video' },
  { in: '.pdf', out: 'Document' },
  { in: '$…$', out: 'Math' },
  { in: '``` code ```', out: 'Code' },
  { in: 'text ending in ?', out: 'Question' },
];
