import { act, create } from 'react-test-renderer';

import { drafts } from '@/lib/storage';

import { AUTOSAVE_MS, clearDraft, isDraftNewer, useAutosave, type Autosave } from '../autosave';

// MMKV needs its native module, so tests get an in-memory drafts store with the same shape.
jest.mock('@/lib/storage', () => {
  const mem = new Map<string, { value: unknown; savedAt: number }>();
  return {
    drafts: {
      get: (scope: string) => mem.get(scope),
      set: (scope: string, value: unknown) => void mem.set(scope, { value, savedAt: Date.now() }),
      remove: (scope: string) => void mem.delete(scope),
      clearAll: () => mem.clear(),
    },
  };
});

describe('isDraftNewer', () => {
  const savedAt = Date.parse('2026-10-01T12:00:00.000Z');

  it('offers a different draft saved after the server copy', () => {
    expect(isDraftNewer({ value: 'mine', savedAt }, 'server', '2026-10-01T11:59:00.123456Z')).toBe(true);
    expect(isDraftNewer({ value: 'mine', savedAt }, 'server', '2026-10-01T12:01:00Z')).toBe(false);
  });

  it('never offers a draft equal to the server copy, or nothing', () => {
    expect(isDraftNewer({ value: 'same', savedAt }, 'same', null)).toBe(false);
    expect(isDraftNewer({ value: { a: 1 }, savedAt }, { a: 1 }, null)).toBe(false);
    expect(isDraftNewer(null, 'server', null)).toBe(false);
  });

  it('offers any different draft for a new item (no server time)', () => {
    expect(isDraftNewer({ value: 'mine', savedAt }, '', undefined)).toBe(true);
  });
});

describe('useAutosave', () => {
  let saver: Autosave<string> | null = null;
  function Probe({ draftKey }: { draftKey: string }) {
    saver = useAutosave<string>(draftKey);
    return null;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    drafts.clearAll();
  });
  afterEach(() => jest.useRealTimers());

  it('saves every few seconds while typing, not on every keystroke', () => {
    act(() => {
      create(<Probe draftKey="t1" />);
    });
    act(() => {
      saver?.schedule('H');
      saver?.schedule('He');
    });
    expect(drafts.get('t1')).toBeUndefined();
    act(() => {
      jest.advanceTimersByTime(AUTOSAVE_MS);
    });
    expect(drafts.get<string>('t1')?.value).toBe('He');
  });

  it('writes pending text on unmount, unless the draft was cleared after it was typed', () => {
    let root: ReturnType<typeof create> | null = null;
    act(() => {
      root = create(<Probe draftKey="t2" />);
    });
    act(() => saver?.schedule('typed'));
    act(() => root?.unmount());
    expect(drafts.get<string>('t2')?.value).toBe('typed');

    act(() => {
      root = create(<Probe draftKey="t3" />);
    });
    act(() => saver?.schedule('saved to the server'));
    jest.advanceTimersByTime(1);
    clearDraft('t3');
    act(() => root?.unmount());
    expect(drafts.get('t3')).toBeUndefined();
  });
});
