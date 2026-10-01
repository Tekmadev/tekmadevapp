import { setAuthBridge } from '@/api/client';
import { getToolStats, getToolSubmission, getToolSubmissions, toolSubmissionsInfiniteQuery } from '@/api/endpoints/tools';
import { ApiError } from '@/api/errors';
import { metaFixture } from '@/api/mock/fixtures/tools';
import { metaFragment, zToolStats, zToolSubmissionDetail, zToolSubmissionPage, type ToolSubmission } from '@/api/schemas/tools';

/**
 * The free tools domain through the real mock transport: stats that agree with
 * the rows, cursor paging, the detail breakdown, and the inbox anchors.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});
beforeEach(asOwner);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

async function allSubmissions(limit?: number): Promise<{ pages: number; items: ToolSubmission[]; lastLength: number }> {
  const options = toolSubmissionsInfiniteQuery(limit);
  const pages: Awaited<ReturnType<typeof getToolSubmissions>>[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getToolSubmissions({ cursor, limit });
    expect(zToolSubmissionPage.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return { pages: pages.length, items: pages.flatMap((p) => p.items), lastLength: pages[pages.length - 1].items.length };
}

describe('meta fragment', () => {
  it('matches its (empty) schema', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
  });
});

describe('GET /tools/submissions', () => {
  it('pages newest first with an opaque cursor and ends on a short page', async () => {
    const { pages, items, lastLength } = await allSubmissions();
    expect(pages).toBe(2);
    expect(lastLength).toBeGreaterThan(0);
    expect(lastLength).toBeLessThan(30);
    expect(new Set(items.map((s) => s.id)).size).toBe(items.length);
    expect(items.every((s, i) => i === 0 || items[i - 1].createdAt >= s.createdAt)).toBe(true);
    // Both tools, both newsletter answers, and the edge cases the rows must handle.
    expect(new Set(items.map((s) => s.toolName))).toEqual(new Set(['Missed-call leak calculator', 'Speed-to-lead calculator']));
    expect(items.some((s) => s.newsletter) && items.some((s) => !s.newsletter)).toBe(true);
    expect(items.some((s) => s.name === null)).toBe(true);
    expect(items.some((s) => s.business === null)).toBe(true);
    expect(items.some((s) => s.leak === null && s.closeRate === null)).toBe(true);
    expect(items.some((s) => s.replySpeed === null)).toBe(true);
    expect(items.some((s) => !s.delivered.email)).toBe(true);
    expect(items.some((s) => !s.delivered.crm) && items.some((s) => s.delivered.crm)).toBe(true);
    expect(items.some((s) => s.leak !== null && s.leak.amount % 100 !== 0)).toBe(true);
  });

  it('honours a smaller limit', async () => {
    const { pages, items } = await allSubmissions(10);
    expect(pages).toBe(Math.ceil(items.length / 10));
  });

  it('carries the inbox anchors exactly', async () => {
    const { items } = await allSubmissions();
    const chloe = items.find((s) => s.id === 'ts_a5718ece');
    expect(chloe).toMatchObject({ name: 'Chloe Roy', tool: 'missed-call-leak', newsletter: true, leak: { amount: 437_500, currency: 'CAD' }, closeRate: { before: 0.25, after: 0.4 } });
    const noah = items.find((s) => s.id === 'ts_073a151d');
    expect(noah?.leak).toEqual({ amount: 87_525, currency: 'CAD' });
  });
});

describe('GET /tools/stats', () => {
  it('agrees with the rows', async () => {
    const stats = await getToolStats();
    expect(zToolStats.safeParse(stats).success).toBe(true);
    const { items } = await allSubmissions(100);
    const monthAgo = Date.now() - 30 * 86_400_000;
    expect(stats.submissions).toBe(items.length);
    expect(stats.optIns).toBe(items.filter((s) => s.newsletter).length);
    expect(stats.last30d).toBe(items.filter((s) => Date.parse(s.createdAt) >= monthAgo).length);
    expect(stats.last30d).toBeGreaterThan(0);
    expect(stats.last30d).toBeLessThan(stats.submissions);
    expect(stats.leakReported).toEqual({ amount: items.reduce((sum, s) => sum + (s.leak?.amount ?? 0), 0), currency: 'CAD' });
  });

  it('is open to managers too', async () => {
    asManager();
    expect(zToolStats.safeParse(await getToolStats()).success).toBe(true);
  });
});

describe('GET /tools/submissions/:id', () => {
  it('returns the answers and the computed breakdown', async () => {
    const detail = await getToolSubmission('ts_a5718ece');
    expect(zToolSubmissionDetail.safeParse(detail).success).toBe(true);
    expect(detail.answers.length).toBeGreaterThanOrEqual(4);
    expect(detail.answers).toContainEqual({ label: 'Calls missed in a typical month', value: '50' });
    expect(detail.result).toContainEqual({ label: 'Revenue leaking each month', value: '$4,375', emphasis: true });
    expect(detail.result).toContainEqual({ label: 'Close rate when every call is answered', value: '40%', emphasis: true });
    expect(detail.leadId).toBe('ld_a5718ece');
  });

  it('explains a breakdown it could not work out', async () => {
    const { items } = await allSubmissions(100);
    const skipped = items.find((s) => s.leak === null);
    expect(skipped).toBeDefined();
    const detail = await getToolSubmission(skipped?.id ?? '');
    expect(detail.result.some((line) => line.value.startsWith('Not worked out'))).toBe(true);
  });

  it('answers 404 for an unknown id', async () => {
    const e = await apiError(getToolSubmission('ts_missing'));
    expect([e.status, e.code, e.message]).toEqual([404, 'not_found', 'That submission no longer exists.']);
  });
});
