import { beforeAll, describe, expect, it } from 'vitest';

// The store listens for `online` at import time; the node test runner has no window.
let useBoard: typeof import('./board').useBoard;
beforeAll(async () => {
  (globalThis as { window?: unknown }).window ??= { addEventListener() {} };
  ({ useBoard } = await import('./board'));
});

describe('select', () => {
  it('keeps the same array when the ids do not change, so the canvas does not re-sync in a loop', () => {
    useBoard.getState().select([]);
    const before = useBoard.getState().selection;
    useBoard.getState().select([]);
    expect(useBoard.getState().selection).toBe(before);
  });

  it('stores new ids', () => {
    useBoard.getState().select(['c1']);
    expect(useBoard.getState().selection).toEqual(['c1']);
  });
});
