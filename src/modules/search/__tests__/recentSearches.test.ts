import { storage, StorageKeys } from '@/lib/storage';

import { addRecent, forgetRecents, loadRecents, RECENT_MAX, saveRecents } from '../recentSearches';

describe('addRecent', () => {
  it('puts the newest first', () => {
    expect(addRecent(['acme'], 'bolt')).toEqual(['bolt', 'acme']);
  });

  it('folds a repeat (any case) into the newest', () => {
    expect(addRecent(['bolt', 'Acme', 'cedar'], 'acme')).toEqual(['acme', 'bolt', 'cedar']);
  });

  it('trims, collapses spaces and ignores blanks', () => {
    expect(addRecent([], '  acme   plumbing ')).toEqual(['acme plumbing']);
    expect(addRecent(['acme'], '   ')).toEqual(['acme']);
  });

  it(`keeps at most ${RECENT_MAX}`, () => {
    let list: string[] = [];
    for (let i = 0; i < 12; i++) list = addRecent(list, `query ${i}`);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toBe('query 11');
    expect(list[RECENT_MAX - 1]).toBe('query 4');
  });

  it('cuts very long queries', () => {
    expect(addRecent([], 'x'.repeat(500))[0]).toHaveLength(100);
  });
});

describe('stored recents', () => {
  afterEach(() => forgetRecents());

  it('belong to the person who searched', () => {
    saveRecents('usr_owner', ['acme', 'pricing']);
    expect(loadRecents('usr_owner')).toEqual(['acme', 'pricing']);
    expect(loadRecents('usr_manager')).toEqual([]);
    expect(loadRecents(null)).toEqual([]);
  });

  it('are forgotten', () => {
    saveRecents('usr_owner', ['acme']);
    forgetRecents();
    expect(loadRecents('usr_owner')).toEqual([]);
  });

  it('survive a damaged value', () => {
    storage.set(StorageKeys.recentSearches, JSON.stringify({ userId: 'usr_owner', items: ['acme', 7, '', null] }));
    expect(loadRecents('usr_owner')).toEqual(['acme']);
    storage.set(StorageKeys.recentSearches, '{not json');
    expect(loadRecents('usr_owner')).toEqual([]);
  });
});
