import type { AnalyticsPoint } from '@/api/schemas/analytics';

import {
  averageLabel,
  chartTitle,
  countryRows,
  expectedAveragePer,
  expectedBucket,
  flagFromCode,
  formatAverage,
  formatKpi,
  formatTotal,
  hasTraffic,
  kpiColumns,
  NO_DATA,
  NOTHING_BEFORE,
  pageviewsSub,
  peakCaption,
  peakLabel,
  peakValue,
  toRange,
  UNKNOWN_FLAG,
} from '../logic';

/** A fixed "now" in Toronto (Oct 2, 2026, midday). */
const NOW = new Date('2026-10-02T16:00:00Z');

const point = (label: string, count: number, title = label): AnalyticsPoint => ({ t: '2026-10-02', label, count, title });

describe('toRange', () => {
  it('reads a known range and falls back to 30 days', () => {
    expect(toRange('7d')).toBe('7d');
    expect(toRange('all')).toBe('all');
    expect(toRange(['3m', '6m'])).toBe('3m');
    expect(toRange(undefined)).toBe('30d');
    expect(toRange('2w')).toBe('30d');
    expect(toRange('')).toBe('30d');
  });

  it('knows the bucket and average unit each range will get', () => {
    expect(['24h', '7d', '30d', '3m', '6m', '1y', 'all'].map((r) => expectedBucket(toRange(r)))).toEqual([
      'hour',
      'day',
      'day',
      'week',
      'week',
      'month',
      'month',
    ]);
    expect(expectedAveragePer('24h')).toBe('hour');
    expect(expectedAveragePer('6m')).toBe('day');
  });
});

describe('copy', () => {
  it('names the chart and KPIs after the bucket', () => {
    expect(chartTitle('day')).toBe('Pageviews by day');
    expect(averageLabel('hour')).toBe('Average per hour');
    expect(peakLabel('week')).toBe('Busiest week');
    expect(peakLabel('month')).toBe('Busiest month');
  });
});

describe('pageviewsSub', () => {
  const base = { total: 1348, prevTotal: 1204, change: 0.1196, trackingSince: '2025-06-19' };

  it('compares with the period before', () => {
    expect(pageviewsSub(base, NOW)).toBe('Up 12% on the period before (1,204)');
    expect(pageviewsSub({ ...base, total: 1168, change: -0.0299 }, NOW)).toBe('Down 3% on the period before (1,204)');
    expect(pageviewsSub({ ...base, total: 1205, change: 0.0008 }, NOW)).toBe('No change on the period before (1,204)');
  });

  it('works the ratio out when the server leaves it out', () => {
    expect(pageviewsSub({ ...base, total: 1500, prevTotal: 1000, change: null }, NOW)).toBe('Up 50% on the period before (1,000)');
  });

  it('says when tracking started when the period before was not tracked', () => {
    expect(pageviewsSub({ ...base, prevTotal: null, change: null }, NOW)).toBe('Tracking started Jun 19, 2025');
    expect(pageviewsSub({ ...base, prevTotal: null, change: null, trackingSince: '2026-03-04' }, NOW)).toBe('Tracking started Mar 4');
  });

  it('says nothing came before when the period before was empty or nothing was ever tracked', () => {
    expect(pageviewsSub({ ...base, prevTotal: 0, change: null }, NOW)).toBe(NOTHING_BEFORE);
    expect(pageviewsSub({ total: 0, prevTotal: null, change: null, trackingSince: null }, NOW)).toBe(NOTHING_BEFORE);
    expect(NOTHING_BEFORE).toBe('Nothing in the period before');
  });
});

describe('busiest bucket', () => {
  const series = [point('1 PM', 12, 'Fri, Oct 2, 1 PM'), point('2 PM', 19, 'Fri, Oct 2, 2 PM'), point('3 PM', 7, 'Fri, Oct 2, 3 PM')];

  it('gives an hour its day (the tooltip title), other buckets their label', () => {
    const peak = { label: '2 PM', count: 19 };
    expect(peakCaption({ bucket: 'hour', peak, series })).toBe('Fri, Oct 2, 2 PM');
    expect(peakCaption({ bucket: 'week', peak: { label: 'Week of Sep 7', count: 900 }, series: [] })).toBe('Week of Sep 7');
    // A label that is not in the series is shown as sent.
    expect(peakCaption({ bucket: 'hour', peak: { label: '9 AM', count: 4 }, series })).toBe('9 AM');
  });

  it('is 0 with no traffic at all, and missing (never 0) otherwise', () => {
    expect(peakCaption({ bucket: 'day', peak: null, series: [] })).toBe(NO_DATA);
    expect(peakValue({ peak: { label: 'Sep 30', count: 214 }, total: 3000 })).toBe(214);
    expect(peakValue({ peak: null, total: 0 })).toBe(0);
    expect(peakValue({ peak: null, total: 12 })).toBeNull();
  });
});

describe('number formats', () => {
  it('keeps totals exact until they get huge', () => {
    expect(formatTotal(48_213)).toBe('48,213');
    expect(formatTotal(9_999_999)).toBe('9,999,999');
    expect(formatTotal(12_400_000)).toBe('12.4M');
    expect(formatKpi(99_999)).toBe('99,999');
    expect(formatKpi(124_800)).toBe('124.8K');
  });

  it('shows small averages with one decimal and larger ones whole', () => {
    expect(formatAverage(4.63)).toBe('4.6');
    expect(formatAverage(5)).toBe('5');
    expect(formatAverage(9.96)).toBe('10');
    expect(formatAverage(0)).toBe('0');
    expect(formatAverage(142.3)).toBe('142');
    expect(formatAverage(1504.5)).toBe('1,505');
    expect(formatAverage(Number.NaN)).toBe('');
  });

  it('treats an all-zero list as no data', () => {
    expect(hasTraffic([])).toBe(false);
    expect(hasTraffic([{ count: 0 }, { count: 0 }])).toBe(false);
    expect(hasTraffic([{ count: 0 }, { count: 3 }])).toBe(true);
  });
});

describe('country flags', () => {
  it('builds the flag from the ISO code', () => {
    expect(flagFromCode('CA')).toBe('\u{1F1E8}\u{1F1E6}');
    expect(flagFromCode('us')).toBe('\u{1F1FA}\u{1F1F8}');
    expect(flagFromCode(' gb ')).toBe('\u{1F1EC}\u{1F1E7}');
  });

  it('has no flag for missing, malformed or placeholder codes', () => {
    for (const code of [undefined, null, '', 'C', 'CAN', 'C1', 'XX', 'zz']) expect(flagFromCode(code)).toBeNull();
  });

  it('puts the flag before the name, with a globe for an unknown country among flags', () => {
    const rows = countryRows([
      { label: 'Canada', count: 900, code: 'CA' },
      { label: 'Somewhere', count: 40, code: 'XX' },
      { label: 'France', count: 12, flag: '\u{1F1EB}\u{1F1F7}' },
    ]);
    expect(rows).toEqual([
      { key: 'CA', label: 'Canada', value: 900, leading: '\u{1F1E8}\u{1F1E6}' },
      { key: 'XX', label: 'Somewhere', value: 40, leading: UNKNOWN_FLAG },
      { key: 'France', label: 'France', value: 12, leading: '\u{1F1EB}\u{1F1F7}' },
    ]);
  });

  it('leaves the flag column out when no row has one', () => {
    expect(countryRows([{ label: 'Canada', count: 3 }])).toEqual([{ key: 'Canada', label: 'Canada', value: 3 }]);
  });
});

describe('kpiColumns', () => {
  const labels = [averageLabel('hour'), peakLabel('month')];

  it('puts the small cards side by side when the longest label fits', () => {
    expect(kpiColumns(412, 1, labels)).toBe(2);
    expect(kpiColumns(412, 1, [averageLabel('day'), peakLabel('day')])).toBe(2);
  });

  it('stacks them on narrow phones or at large font sizes', () => {
    expect(kpiColumns(360, 1, labels)).toBe(1);
    expect(kpiColumns(412, 1.3, labels)).toBe(1);
    // Font scale is capped at 1.3: 2.0 lays out like 1.3.
    expect(kpiColumns(600, 2, labels)).toBe(kpiColumns(600, 1.3, labels));
  });
});
