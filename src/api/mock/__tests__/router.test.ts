import { compareVersions } from '@/api/mock';
import {
  bool,
  byNewest,
  fail,
  isEmail,
  isoMicros,
  matches,
  notFound,
  num,
  ok,
  paginate,
  pick,
  str,
  torontoDate,
} from '@/api/mock/router';
import { toDate } from '@/lib/dates';

// The transport module pulls in every domain's routes and fixtures; these tests only
// need its pure helpers, so keep them independent of fixture work in progress.
jest.mock('@/api/mock/routes', () => ({ allRoutes: () => [] }));

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `row_${i}` }));

/** Walk every page by passing nextCursor back exactly as received. */
function walk<T>(items: T[], limit?: number): { pages: T[][]; cursors: (string | null)[] } {
  const pages: T[][] = [];
  const cursors: (string | null)[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 1000; guard++) {
    const query: Record<string, string> = {};
    if (cursor) query.cursor = cursor;
    if (limit !== undefined) query.limit = String(limit);
    const page = paginate(items, query);
    pages.push(page.items);
    cursors.push(page.nextCursor);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { pages, cursors };
}

describe('paginate', () => {
  it('returns 30 items by default', () => {
    const page = paginate(rows(250), {});
    expect(page.items).toHaveLength(30);
    expect(page.items[0]).toEqual({ id: 'row_0' });
    expect(page.nextCursor).not.toBeNull();
  });

  it('honours the limit, capped at 100', () => {
    expect(paginate(rows(250), { limit: '10' }).items).toHaveLength(10);
    expect(paginate(rows(250), { limit: '100' }).items).toHaveLength(100);
    expect(paginate(rows(250), { limit: '500' }).items).toHaveLength(100);
  });

  it('treats a bad limit sensibly', () => {
    expect(paginate(rows(250), { limit: 'abc' }).items).toHaveLength(30);
    expect(paginate(rows(250), { limit: '0' }).items).toHaveLength(30);
    expect(paginate(rows(250), { limit: '-5' }).items).toHaveLength(1);
  });

  it('uses a per-route default when given', () => {
    expect(paginate(rows(250), {}, 20).items).toHaveLength(20);
  });

  it('round trips the cursor through every page, without gaps or repeats', () => {
    const items = rows(95);
    const { pages, cursors } = walk(items);
    expect(pages.map((p) => p.length)).toEqual([30, 30, 30, 5]);
    expect(pages.flat()).toEqual(items);
    expect(cursors[cursors.length - 1]).toBeNull();
  });

  it('ends with a null cursor on an exact multiple (no empty last page)', () => {
    const { pages } = walk(rows(60));
    expect(pages.map((p) => p.length)).toEqual([30, 30]);
  });

  it('handles empty and single-page lists', () => {
    expect(paginate([], {})).toEqual({ items: [], nextCursor: null });
    expect(paginate(rows(3), {})).toEqual({ items: rows(3), nextCursor: null });
  });

  it('keeps the limit across pages', () => {
    const { pages } = walk(rows(25), 10);
    expect(pages.map((p) => p.length)).toEqual([10, 10, 5]);
  });

  it('makes opaque cursors: not a number, not an offset, not a date', () => {
    const { cursors } = walk(rows(95));
    for (const cursor of cursors.filter((c): c is string => c !== null)) {
      expect(typeof cursor).toBe('string');
      expect(Number.isNaN(Number(cursor))).toBe(true);
      expect(toDate(cursor)).toBeNull();
      expect(cursor).not.toMatch(/^(30|60|90)$/);
    }
    expect(new Set(cursors).size).toBe(cursors.length);
  });

  it('starts over on a cursor it did not issue (never throws)', () => {
    for (const cursor of ['garbage', '30', 'c1..', 'c1.zz.zz.zz', '']) {
      expect(paginate(rows(50), { cursor }).items[0]).toEqual({ id: 'row_0' });
    }
  });

  it('returns an empty last page for a cursor past the end', () => {
    const cursor = paginate(rows(40), {}).nextCursor;
    expect(cursor).not.toBeNull();
    expect(paginate(rows(10), { cursor: cursor ?? '' })).toEqual({ items: [], nextCursor: null });
  });
});

describe('matches', () => {
  it('matches everything without a query', () => {
    expect(matches(undefined, 'Acme')).toBe(true);
    expect(matches('', 'Acme')).toBe(true);
    expect(matches('   ', 'Acme')).toBe(true);
  });

  it('is a trimmed, case-insensitive "contains" across fields', () => {
    expect(matches('acme', 'Acme Plumbing')).toBe(true);
    expect(matches('  PLUMB ', 'Acme Plumbing')).toBe(true);
    expect(matches('maya', 'Acme Plumbing', 'maya@acme.test')).toBe(true);
    expect(matches('ottawa', 'Acme Plumbing', 'maya@acme.test')).toBe(false);
  });

  it('skips null and undefined fields', () => {
    expect(matches('acme', null, undefined, 'acme.test')).toBe(true);
    expect(matches('acme', null, undefined)).toBe(false);
  });
});

describe('isoMicros', () => {
  it('has 6 fractional digits and a Z, like the server', () => {
    const iso = isoMicros(new Date('2026-09-30T14:03:22.123Z'));
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    expect(iso.startsWith('2026-09-30T14:03:22.123')).toBe(true);
  });

  it('pads milliseconds', () => {
    expect(isoMicros(new Date('2026-09-30T14:03:22.000Z'))).toMatch(/^2026-09-30T14:03:22\.000\d{3}Z$/);
    expect(isoMicros(new Date('2026-09-30T14:03:22.007Z'))).toMatch(/^2026-09-30T14:03:22\.007\d{3}Z$/);
  });

  it('parses back to the same millisecond', () => {
    for (const ms of [0, 1, 999, 1_789_000_000_123]) {
      const d = new Date(Date.UTC(2026, 8, 30) + ms);
      expect(toDate(isoMicros(d))?.getTime()).toBe(d.getTime());
    }
  });

  it('is deterministic and sorts as text in time order', () => {
    const a = new Date('2026-09-30T14:03:22.123Z');
    const b = new Date('2026-09-30T14:03:22.124Z');
    expect(isoMicros(a)).toBe(isoMicros(new Date(a.getTime())));
    expect(isoMicros(a) < isoMicros(b)).toBe(true);
  });
});

describe('torontoDate', () => {
  const freeze = (iso: string) => jest.spyOn(Date, 'now').mockReturnValue(new Date(iso).getTime());

  afterEach(() => jest.restoreAllMocks());

  it('is the Toronto calendar date, not the UTC one', () => {
    // 11:30 PM on September 30 in Toronto, already October 1 in UTC.
    freeze('2026-10-01T03:30:00Z');
    expect(torontoDate()).toBe('2026-09-30');
    expect(torontoDate(0)).toBe('2026-09-30');
    expect(torontoDate(1)).toBe('2026-10-01');
    expect(torontoDate(-1)).toBe('2026-09-29');
    expect(torontoDate(-30)).toBe('2026-08-31');
  });

  it('switches at Toronto midnight', () => {
    freeze('2026-10-01T03:59:59Z');
    expect(torontoDate()).toBe('2026-09-30');
    freeze('2026-10-01T04:00:00Z');
    expect(torontoDate()).toBe('2026-10-01');
  });

  it('counts calendar days across spring forward (a 23 hour day)', () => {
    // 11:30 PM on March 7 in Toronto; the next day is only 23 hours long.
    freeze('2026-03-08T04:30:00Z');
    expect(torontoDate()).toBe('2026-03-07');
    expect(torontoDate(1)).toBe('2026-03-08');
    expect(torontoDate(2)).toBe('2026-03-09');
  });

  it('counts calendar days across fall back (a 25 hour day)', () => {
    // 12:30 AM on November 1 in Toronto; that day is 25 hours long.
    freeze('2026-11-01T04:30:00Z');
    expect(torontoDate()).toBe('2026-11-01');
    expect(torontoDate(1)).toBe('2026-11-02');
    expect(torontoDate(-1)).toBe('2026-10-31');
  });

  it('is always YYYY-MM-DD', () => {
    freeze('2026-01-05T15:00:00Z');
    expect(torontoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(torontoDate()).toBe('2026-01-05');
  });
});

describe('compareVersions', () => {
  it.each([
    ['1.2.3', '1.2.3', 0],
    ['0.1.0', '0.2.0', -1],
    ['0.2.0', '0.1.0', 1],
    ['1.2.10', '1.2.9', 1],
    ['1.10', '1.9.9', 1],
    ['1.0', '1.0.0', 0],
    ['2', '1.99.99', 1],
    ['1.2', '1.2.1', -1],
    ['0.0.0', 'garbage', 0],
    ['1.2.3-beta', '1.2.3', 0],
  ])('%s vs %s is %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
    expect(compareVersions(b, a)).toBe(expected === 0 ? 0 : -expected);
  });
});

describe('small helpers', () => {
  it('ok and fail build the envelope', () => {
    expect(ok({ id: 1 })).toEqual({ status: 200, body: { ok: true, data: { id: 1 } } });
    expect(ok(null, 201)).toEqual({ status: 201, body: { ok: true, data: null } });
    expect(fail(400, 'email', 'Enter a valid email.')).toEqual({ status: 400, body: { ok: false, error: { code: 'email', message: 'Enter a valid email.' } } });
    expect(fail(400, 'required', 'Required.', { email: 'Enter a valid email.' }).body).toEqual({
      ok: false,
      error: { code: 'required', message: 'Required.', fields: { email: 'Enter a valid email.' } },
    });
    expect(notFound('That client')).toEqual({ status: 404, body: { ok: false, error: { code: 'not_found', message: 'That client no longer exists.' } } });
  });

  it('str, num and bool read untyped bodies safely', () => {
    expect(str('a')).toBe('a');
    expect(str(1)).toBeUndefined();
    expect(num(3)).toBe(3);
    expect(num(NaN)).toBeUndefined();
    expect(num('3')).toBeUndefined();
    expect(bool(false)).toBe(false);
    expect(bool('true')).toBeUndefined();
  });

  it('isEmail', () => {
    expect(isEmail('maya@tekmadev.com')).toBe(true);
    expect(isEmail(' maya@tekmadev.com ')).toBe(true);
    expect(isEmail('maya@tekmadev')).toBe(false);
    expect(isEmail(undefined)).toBe(false);
  });

  it('byNewest sorts ISO strings newest first, missing values last', () => {
    const list = [{ at: '2026-09-29T10:00:00.000000Z' }, { at: null }, { at: '2026-09-30T10:00:00.000000Z' }];
    expect([...list].sort(byNewest((r) => r.at)).map((r) => r.at)).toEqual(['2026-09-30T10:00:00.000000Z', '2026-09-29T10:00:00.000000Z', null]);
  });

  it('pick wraps around in both directions', () => {
    expect(pick(['a', 'b', 'c'], 0)).toBe('a');
    expect(pick(['a', 'b', 'c'], 4)).toBe('b');
    expect(pick(['a', 'b', 'c'], -1)).toBe('c');
  });
});
