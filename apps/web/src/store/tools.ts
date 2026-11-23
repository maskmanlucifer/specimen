import { create } from 'zustand';

export type Tool = 'select' | 'connect' | 'section';

/** Label presets offered by the Connect tool; `undefined` draws an unlabelled connection. */
export const LINK_PRESETS = [undefined, 'input', 'source', 'feeds', 'see also', 'then'] as const;

interface ToolState {
  tool: Tool;
  /** Label given to connections drawn while the Connect tool is active. */
  connectLabel: string | undefined;
  /** True while the toolbar is the inline composer. */
  composing: boolean;
  /** True while the Add tray (card types) is open. */
  adding: boolean;
  setTool: (t: Tool) => void;
  setConnectLabel: (l: string | undefined) => void;
  setComposing: (v: boolean) => void;
  setAdding: (v: boolean) => void;
}

/** Canvas tool state shared by the toolbar, the canvas and keyboard shortcuts. */
export const useTools = create<ToolState>((set) => ({
  tool: 'select',
  connectLabel: undefined,
  composing: false,
  adding: false,
  setTool: (tool) => set({ tool, adding: false, composing: false }),
  setConnectLabel: (connectLabel) => set({ connectLabel }),
  setComposing: (composing) => set({ composing, adding: false }),
  setAdding: (adding) => set({ adding, composing: false }),
}));
