import type { SheetProps } from '../Sheet';
import { createSheetStore, topOpenEntry } from '../sheetStore';

const props = (over: Partial<SheetProps> = {}): SheetProps => ({
  visible: true,
  onClose: () => undefined,
  children: null,
  ...over,
});

describe('sheet store', () => {
  it('stacks sheets in the order they open', () => {
    const store = createSheetStore();
    store.show('a', props({ title: 'A' }));
    store.show('b', props({ title: 'B' }));
    expect(store.getSnapshot().map((e) => e.id)).toEqual(['a', 'b']);
    expect(topOpenEntry(store.getSnapshot())?.id).toBe('b');
  });

  it('does not commit when the props did not change', () => {
    const store = createSheetStore();
    const listener = jest.fn();
    store.subscribe(listener);
    const p = props({ title: 'A' });
    store.show('a', p);
    store.show('a', { ...p });
    expect(listener).toHaveBeenCalledTimes(1);
    store.show('a', { ...p, title: 'A2' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()[0].props.title).toBe('A2');
  });

  it('closes, then removes', () => {
    const store = createSheetStore();
    store.show('a', props());
    store.close('a');
    expect(store.getSnapshot()[0].closing).toBe(true);
    expect(topOpenEntry(store.getSnapshot())).toBeUndefined();
    store.remove('a');
    expect(store.getSnapshot()).toEqual([]);
  });

  it('brings a closing sheet back in its place', () => {
    const store = createSheetStore();
    store.show('a', props());
    store.show('b', props());
    store.close('a');
    store.show('a', props({ title: 'again' }));
    expect(store.getSnapshot().map((e) => [e.id, e.closing])).toEqual([
      ['a', false],
      ['b', false],
    ]);
  });

  it('ignores closing or removing what is not there', () => {
    const store = createSheetStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.close('nope');
    store.remove('nope');
    expect(listener).not.toHaveBeenCalled();
  });

  it('sends back to the topmost open sheet and swallows it while any is open', () => {
    const store = createSheetStore();
    const dismissA = jest.fn();
    const dismissB = jest.fn();
    expect(store.dismissTop()).toBe(false);

    store.show('a', props());
    store.show('b', props());
    store.setDismisser('a', dismissA);
    store.setDismisser('b', dismissB);
    expect(store.dismissTop()).toBe(true);
    expect(dismissB).toHaveBeenCalledTimes(1);
    expect(dismissA).not.toHaveBeenCalled();

    // b is animating out: back now goes to a.
    store.close('b');
    expect(store.dismissTop()).toBe(true);
    expect(dismissA).toHaveBeenCalledTimes(1);

    store.close('a');
    expect(store.dismissTop()).toBe(false);
  });

  it('unsubscribes', () => {
    const store = createSheetStore();
    const listener = jest.fn();
    const off = store.subscribe(listener);
    off();
    store.show('a', props());
    expect(listener).not.toHaveBeenCalled();
  });
});
