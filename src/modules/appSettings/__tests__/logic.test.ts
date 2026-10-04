import { NOTIFICATION_CATEGORIES, type NotificationPrefs } from '@/api/schemas/notifications';

import {
  KIT_TAP_WINDOW_MS,
  KIT_TAPS_START,
  prefRows,
  registerKitTap,
  replacePref,
  revertPrefField,
  setPrefField,
  testPushMessage,
  type CategoryMeta,
  type KitTapResult,
} from '../logic';

const prefs: NotificationPrefs = [
  { category: 'system', label: 'System', muted: false, push: true },
  { category: 'leads', label: 'Leads', muted: false, push: true },
  { category: 'team', label: 'Team', muted: false, push: false },
  { category: 'audience', label: 'Audience', muted: true, push: false },
  { category: 'sales', label: 'Sales', muted: false, push: true },
];

const meta: CategoryMeta[] = [
  { value: 'leads', label: 'Leads' },
  { value: 'sales', label: 'Sales and orders' },
  { value: 'billing', label: 'Billing' },
  { value: 'clients', label: 'Clients' },
  { value: 'audience', label: 'Audience' },
  { value: 'team', label: 'Team' },
  { value: 'system', label: 'System' },
];

/** What an owner or a manager reads (every `inbox.*`), and what staff read (Leads and Clients). */
const ALL = NOTIFICATION_CATEGORIES;

describe('prefRows', () => {
  it('follows the meta order and labels, skipping categories without a row', () => {
    expect(prefRows(prefs, meta, ALL).map((p) => [p.category, p.label])).toEqual([
      ['leads', 'Leads'],
      ['sales', 'Sales and orders'],
      ['audience', 'Audience'],
      ['team', 'Team'],
      ['system', 'System'],
    ]);
  });

  it('falls back to the brief order without meta', () => {
    expect(prefRows(prefs, undefined, ALL).map((p) => p.category)).toEqual(['leads', 'sales', 'audience', 'team', 'system']);
  });

  it('shows only the categories this person may read, even if the server sent more rows', () => {
    expect(prefRows(prefs, meta, ['leads', 'clients']).map((p) => p.category)).toEqual(['leads']);
    expect(prefRows(prefs, undefined, ['leads', 'sales', 'system']).map((p) => p.category)).toEqual(['leads', 'sales', 'system']);
    expect(prefRows(prefs, meta, [])).toEqual([]);
  });
});

describe('optimistic prefs', () => {
  it('sets one field of one category', () => {
    const next = setPrefField(prefs, 'leads', 'muted', true);
    expect(next.find((p) => p.category === 'leads')).toEqual({ category: 'leads', label: 'Leads', muted: true, push: true });
    expect(next.find((p) => p.category === 'sales')).toBe(prefs.find((p) => p.category === 'sales'));
  });

  it('rolls back only while the failed value is still showing', () => {
    const optimistic = setPrefField(prefs, 'leads', 'push', false);
    expect(revertPrefField(optimistic, 'leads', 'push', false, true).find((p) => p.category === 'leads')?.push).toBe(true);
    // A newer tap set it back to true: the failed "false" no longer owns the value.
    const newer = setPrefField(optimistic, 'leads', 'push', true);
    expect(revertPrefField(newer, 'leads', 'push', false, true)).toBe(newer);
  });

  it('puts the server row in place', () => {
    const server = { category: 'sales' as const, label: 'Sales', muted: true, push: false };
    const next = replacePref(prefs, server);
    expect(next[4]).toBe(server);
    expect(next.length).toBe(prefs.length);
  });
});

describe('testPushMessage', () => {
  it('says where the test went', () => {
    expect(testPushMessage(1, true)).toBe('Test sent to this phone.');
    expect(testPushMessage(1, false)).toBe('Test sent to 1 phone on your account.');
    expect(testPushMessage(3, false)).toBe('Test sent to 3 phones on your account.');
  });
});

describe('registerKitTap', () => {
  const tapAt = (times: number[]): KitTapResult[] => {
    let taps = KIT_TAPS_START;
    return times.map((t) => {
      const result = registerKitTap(taps, t);
      taps = result.next;
      return result;
    });
  };

  it('opens on the 7th quick tap, counting down from the 4th', () => {
    const results = tapAt([0, 200, 400, 600, 800, 1000, 1200]);
    expect(results.map((r) => r.event)).toEqual(['tap', 'tap', 'tap', 'countdown', 'countdown', 'countdown', 'open']);
    expect(results.map((r) => r.remaining)).toEqual([6, 5, 4, 3, 2, 1, 0]);
  });

  it('starts over after a pause, and after opening', () => {
    const results = tapAt([0, 200, 400, 400 + KIT_TAP_WINDOW_MS + 1]);
    expect(results[3]?.remaining).toBe(6);
    const again = tapAt([0, 100, 200, 300, 400, 500, 600, 700]);
    expect(again[7]?.event).toBe('tap');
  });
});
