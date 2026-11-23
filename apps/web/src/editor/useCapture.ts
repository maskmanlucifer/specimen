import { useCallback, useRef } from 'react';
import { CARD_LABEL, type Card } from '@specimen/schema';
import { api } from '../lib/api';
import { analyseAudio, classifyText, fileKind, pdfPages, videoDuration } from '../lib/capture';
import { useBoard } from '../store/board';
import { toast } from '../store/toast';
import { useUploads } from '../store/uploads';

type At = { x: number; y: number };

/**
 * Turns pasted text and dropped files into cards at a canvas position.
 * Links are created at once and filled in when the preview arrives.
 */
export function useCapture() {
  const last = useRef<string | null>(null);

  const undoToast = (text: string) => toast(text, { label: 'Undo ⌘Z', run: () => useBoard.getState().undo() });

  const addText = useCallback(async (raw: string, at: At) => {
    const { addCard, updateCard } = useBoard.getState();
    const input = classifyText(raw);
    const card = addCard({ ...input, w: input.type === 'code' ? 300 : 240 }, at);
    last.current = card.id;
    undoToast(`Pasted ${input.type === 'link' ? 'link' : 'text'} → ${CARD_LABEL[card.type]} card`);
    if (card.type === 'link') {
      const u = await api.unfurl(card.url).catch(() => null);
      if (u) updateCard(card.id, { title: u.title, site: u.site, description: u.description, image: u.image });
    }
    return card;
  }, []);

  const addFiles = useCallback(async (files: File[], at: At) => {
    const { storageId, slug, addCard } = useBoard.getState();
    const start = useUploads.getState().start;
    await Promise.all(
      files.map(async (file, i) => {
        const kind = fileKind(file);
        const pos = { x: at.x + i * 24, y: at.y + i * 24 };
        if (!kind) {
          toast(`${file.name}: this file type is not supported`);
          return;
        }
        if (kind === 'note') {
          addCard({ type: 'note', text: (await file.text()).slice(0, 20_000), x: 0, y: 0 }, pos);
          return;
        }
        const meta = kind === 'audio' ? await analyseAudio(file) : null;
        const duration = kind === 'video' ? await videoDuration(file) : meta?.duration;
        const pages = kind === 'document' ? await pdfPages(file) : undefined;
        try {
          const { src, size } = await start(storageId, slug, file, kind, pos);
          const title = file.name;
          let card: Card;
          if (kind === 'image') card = addCard({ type: 'image', src, caption: undefined, alt: title, x: 0, y: 0 }, pos);
          else if (kind === 'audio') card = addCard({ type: 'audio', src, title, size, duration, peaks: meta?.peaks, markers: [], transcript: [], x: 0, y: 0, w: 380 }, pos);
          else if (kind === 'video') card = addCard({ type: 'video', src, title, size, duration, x: 0, y: 0, w: 272 }, pos);
          else card = addCard({ type: 'document', src, title: title.replace(/\.pdf$/i, ''), pages, size, x: 0, y: 0 }, pos);
          last.current = card.id;
          useBoard.getState().change(() => undefined, { history: false, log: { action: 'uploaded', cardId: card.id, text: `Uploaded ${file.name}` } });
        } catch (e) {
          toast(`${file.name}: ${(e as Error).message}`);
        }
      }),
    );
  }, []);

  /** Reads a clipboard or drop event. Returns true when it handled something. */
  const fromData = useCallback(
    (data: DataTransfer | null, at: At): boolean => {
      if (!data) return false;
      const files = [...data.files];
      if (files.length) {
        addFiles(files, at);
        return true;
      }
      const text = data.getData('text/plain');
      if (text.trim()) {
        addText(text, at);
        return true;
      }
      return false;
    },
    [addFiles, addText],
  );

  return { addText, addFiles, fromData, last };
}
