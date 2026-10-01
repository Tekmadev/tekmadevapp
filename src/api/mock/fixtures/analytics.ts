import { addDays, daysBetween, monthName, monthShort, parseCalendarDate, todayToronto, torontoParts, weekdayName, weekdayOf } from '@/lib/dates';

import type { Analytics, AnalyticsBucket, AnalyticsMeta, AnalyticsPoint, AnalyticsRange, CountryCount } from '../../schemas/analytics';
import type { LabelCount } from '../../types';

/**
 * Fixtures for the "analytics" domain: first-party pageviews for a local agency
 * site. Nothing is stored; every number is derived from the calendar with a
 * stable hash, so the same day always has the same count, ranges agree with each
 * other, and the shapes look real: about 60 to 220 pageviews a day today, weekday
 * peaks, quiet weekends, slow growth since tracking started, a couple of spikes
 * when a blog post did well, and office-hours peaks within the day.
 *
 * Every date is a Toronto calendar date and every hour a Toronto wall hour.
 */

/** Tracking started this many days ago (about 15 months), so "1 year" has no full period before it. */
const TRACKING_DAYS = 470;

/** Flip with `analyticsMock.setEmpty(true)` to see the "No data yet." states. */
const state = { empty: false };
export const analyticsMock = {
  setEmpty(empty: boolean) {
    state.empty = empty;
  },
  reset() {
    state.empty = false;
  },
};

/* ---------- the traffic model ---------- */

/** Stable pseudo-random number in [0, 1) for a key (FNV-1a). */
function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Sunday first, like Date.getUTCDay(). Busiest Tuesday, quietest Sunday. */
const WEEKDAY = [0.58, 1.1, 1.16, 1.12, 1.06, 0.93, 0.62];

/** Share of a day's pageviews per Toronto hour: office hours, a lunch dip, a small evening bump. */
const HOUR_RAW = [12, 8, 6, 5, 5, 8, 18, 32, 52, 66, 72, 73, 64, 68, 67, 64, 58, 50, 45, 44, 42, 36, 28, 20];
const HOUR_SUM = HOUR_RAW.reduce((a, b) => a + b, 0);
const HOUR = HOUR_RAW.map((w) => w / HOUR_SUM);

/** Days a blog post did well (days ago, multiplier). */
const SPIKES: Record<number, number> = { 43: 2.4, 42: 1.6, 161: 2.1, 160: 1.3, 298: 1.8 };

type Clock = { today: string; hour: number; minute: number; nowMs: number };

function clock(nowMs: number = Date.now()): Clock {
  const p = torontoParts(new Date(nowMs));
  return { today: todayToronto(new Date(nowMs)), hour: p.hour, minute: p.minute, nowMs };
}

const trackingStart = (c: Clock) => addDays(c.today, -TRACKING_DAYS);

/** Expected pageviews for a full Toronto day (before rounding). */
function dayBase(date: string, c: Clock): number {
  const age = daysBetween(date, c.today);
  if (age < 0 || age > TRACKING_DAYS) return 0;
  const growth = 0.42 + 0.58 * (1 - age / TRACKING_DAYS);
  const spike = SPIKES[age] ?? (noise(`${date}:spike`) > 0.988 ? 1.7 : 1);
  return 150 * growth * WEEKDAY[weekdayOf(date)] * (0.82 + 0.36 * noise(date)) * spike;
}

/** Share of today already gone by (Toronto wall clock), weighted by the hourly curve. */
function elapsedShare(c: Clock): number {
  let share = 0;
  for (let h = 0; h < c.hour; h++) share += HOUR[h];
  return share + HOUR[c.hour] * (c.minute / 60);
}

/** Pageviews for a calendar day; today counts only what already happened. */
function dayCount(date: string, c: Clock): number {
  const base = dayBase(date, c);
  return Math.round(date === c.today ? base * elapsedShare(c) : base);
}

/** Pageviews in one Toronto hour of a day. */
function hourCount(date: string, hour: number, c: Clock, fraction = 1): number {
  return Math.round(dayBase(date, c) * HOUR[hour] * (0.75 + 0.5 * noise(`${date}T${hour}`)) * fraction);
}

/* ---------- labels ---------- */

const pad = (n: number) => String(n).padStart(2, '0');
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

function dayParts(date: string) {
  const p = parseCalendarDate(date);
  if (!p) throw new Error(`analytics fixture: bad date ${date}`);
  return p;
}

/** "Sep 7", with the year when it is not the current one. */
function shortDay(date: string, currentYear: number): string {
  const p = dayParts(date);
  return p.year === currentYear ? `${monthShort(p.month)} ${p.day}` : `${monthShort(p.month)} ${p.day}, ${p.year}`;
}

/* ---------- buckets ---------- */

type Window = { points: AnalyticsPoint[]; prevTotal: number | null; days: number };

function hourly(c: Clock): Window {
  const hourMs = 3_600_000;
  // Toronto offsets are whole hours, so UTC hour boundaries are Toronto hour boundaries.
  const currentHourStart = Math.floor(c.nowMs / hourMs) * hourMs;
  const minuteShare = c.minute / 60;
  const at = (k: number) => {
    const p = torontoParts(new Date(currentHourStart - k * hourMs));
    return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, hour: p.hour, weekday: p.weekday, month: p.month, day: p.day };
  };
  const points: AnalyticsPoint[] = [];
  for (let k = 23; k >= 0; k--) {
    const h = at(k);
    points.push({
      t: `${h.date}T${pad(h.hour)}:00:00`,
      count: hourCount(h.date, h.hour, c, k === 0 ? minuteShare : 1),
      label: hourLabel(h.hour),
      title: `${weekdayName(h.weekday).slice(0, 3)}, ${monthShort(h.month)} ${h.day}, ${hourLabel(h.hour)}`,
    });
  }
  let prev = 0;
  for (let k = 47; k >= 24; k--) {
    const h = at(k);
    prev += hourCount(h.date, h.hour, c);
  }
  const prevStart = at(47).date;
  return { points, prevTotal: prevStart < trackingStart(c) ? null : prev, days: 1 };
}

function daily(n: number, c: Clock): Window {
  const year = dayParts(c.today).year;
  const points: AnalyticsPoint[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const date = addDays(c.today, -k);
    const p = dayParts(date);
    points.push({
      t: date,
      count: dayCount(date, c),
      label: `${monthShort(p.month)} ${p.day}`,
      title: `${weekdayName(weekdayOf(date))}, ${monthName(p.month)} ${p.day}${p.year === year ? '' : `, ${p.year}`}`,
    });
  }
  const prevStart = addDays(c.today, -(2 * n - 1));
  let prev = 0;
  for (let k = 2 * n - 1; k >= n; k--) prev += dayCount(addDays(c.today, -k), c);
  return { points, prevTotal: prevStart < trackingStart(c) ? null : prev, days: n };
}

function weekly(n: number, c: Clock): Window {
  const year = dayParts(c.today).year;
  // Weeks start on Monday.
  const monday = addDays(c.today, -((weekdayOf(c.today) + 6) % 7));
  const weekTotal = (start: string) => {
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, d);
      if (date > c.today) break;
      sum += dayCount(date, c);
    }
    return sum;
  };
  const points: AnalyticsPoint[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const start = addDays(monday, -7 * k);
    points.push({
      t: start,
      count: weekTotal(start),
      label: `Week of ${shortDay(start, year)}`,
      title: `${shortDay(start, year)} to ${shortDay(addDays(start, 6), year)}`,
    });
  }
  const prevStart = addDays(monday, -7 * (2 * n - 1));
  let prev = 0;
  for (let k = 2 * n - 1; k >= n; k--) prev += weekTotal(addDays(monday, -7 * k));
  return { points, prevTotal: prevStart < trackingStart(c) ? null : prev, days: daysBetween(addDays(monday, -7 * (n - 1)), c.today) + 1 };
}

function monthly(months: number | 'all', c: Clock): Window {
  const now = dayParts(c.today);
  const start = trackingStart(c);
  const first = dayParts(start);
  const count = months === 'all' ? (now.year - first.year) * 12 + (now.month - first.month) + 1 : months;
  const monthAt = (k: number) => {
    const index = now.year * 12 + (now.month - 1) - k;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  };
  const monthTotal = (year: number, month: number) => {
    let sum = 0;
    for (let d = 1; d <= 31; d++) {
      const date = `${year}-${pad(month)}-${pad(d)}`;
      // Past the end of the month: "2026-02-30" normalises to another day.
      if (addDays(date, 0) !== date) break;
      if (date > c.today) break;
      if (date >= start) sum += dayCount(date, c);
    }
    return sum;
  };
  const points: AnalyticsPoint[] = [];
  for (let k = count - 1; k >= 0; k--) {
    const m = monthAt(k);
    points.push({
      t: `${m.year}-${pad(m.month)}-01`,
      count: monthTotal(m.year, m.month),
      label: `${monthShort(m.month)} ${m.year}`,
      title: `${monthName(m.month)} ${m.year}`,
    });
  }
  // "All time" never has a period before it; "1 year" would start before tracking did.
  let prevTotal: number | null = null;
  if (months !== 'all') {
    const prevFirst = monthAt(2 * count - 1);
    if (`${prevFirst.year}-${pad(prevFirst.month)}-01` >= start) {
      prevTotal = 0;
      for (let k = 2 * count - 1; k >= count; k--) {
        const m = monthAt(k);
        prevTotal += monthTotal(m.year, m.month);
      }
    }
  }
  const windowStart = months === 'all' ? start : `${monthAt(count - 1).year}-${pad(monthAt(count - 1).month)}-01`;
  return { points, prevTotal, days: daysBetween(windowStart < start ? start : windowStart, c.today) + 1 };
}

/* ---------- top lists ---------- */

/** Shares of all pageviews; each range nudges them a little so the donuts are not identical. */
const SOURCES: [string, number][] = [
  ['Google', 0.37],
  ['Direct', 0.24],
  ['Facebook', 0.11],
  ['Instagram', 0.06],
  ['Newsletter', 0.04],
  ['LinkedIn', 0.04],
  ['Bing', 0.03],
  ['ChatGPT', 0.03],
  ['Yelp', 0.015],
  ['Reddit', 0.01],
  ['DuckDuckGo', 0.01],
];
const DEVICES: [string, number][] = [
  ['Mobile', 0.64],
  ['Desktop', 0.33],
  ['Tablet', 0.03],
];
const PAGES: [string, number][] = [
  ['/', 0.27],
  ['/webline', 0.12],
  ['/growth-system', 0.1],
  ['/pricing', 0.08],
  ['/tools/missed-call-leak', 0.07],
  ['/blog/how-fast-should-you-call-back-a-lead', 0.05],
  ['/start', 0.04],
  ['/tools/speed-to-lead', 0.035],
  ['/blog/google-business-profile-checklist-for-contractors', 0.03],
  ['/about', 0.025],
  ['/contact', 0.02],
  ['/blog/what-a-booked-appointment-guarantee-really-means', 0.015],
];
const COUNTRIES: [string, string, number][] = [
  ['Canada', '\u{1F1E8}\u{1F1E6}', 0.86],
  ['United States', '\u{1F1FA}\u{1F1F8}', 0.08],
  ['India', '\u{1F1EE}\u{1F1F3}', 0.015],
  ['United Kingdom', '\u{1F1EC}\u{1F1E7}', 0.01],
  ['Philippines', '\u{1F1F5}\u{1F1ED}', 0.008],
  ['Pakistan', '\u{1F1F5}\u{1F1F0}', 0.006],
  ['Germany', '\u{1F1E9}\u{1F1EA}', 0.004],
  ['France', '\u{1F1EB}\u{1F1F7}', 0.003],
];
const REFERRERS: [string, number][] = [
  ['google.com', 0.3],
  ['facebook.com', 0.08],
  ['l.instagram.com', 0.05],
  ['linkedin.com', 0.035],
  ['bing.com', 0.025],
  ['chatgpt.com', 0.025],
  ['yelp.ca', 0.012],
  ['duckduckgo.com', 0.009],
  ['reddit.com', 0.008],
  ['harbourhvac.test', 0.004],
];

function spread(total: number, shares: [string, number][], range: AnalyticsRange): LabelCount[] {
  return shares
    .map(([label, share]) => ({ label, count: Math.round(total * share * (0.88 + 0.24 * noise(`${range}:${label}`))) }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Like `spread`, but the rows add up to exactly `total` (every pageview has a source and a device). */
function partition(total: number, shares: [string, number][], range: AnalyticsRange): LabelCount[] {
  const rows = spread(total, shares, range);
  const sum = rows.reduce((a, r) => a + r.count, 0);
  if (rows.length > 0) rows[0].count = Math.max(rows[0].count + total - sum, 0);
  return rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
}

/* ---------- the response ---------- */

const BUCKET: Record<AnalyticsRange, AnalyticsBucket> = { '24h': 'hour', '7d': 'day', '30d': 'day', '3m': 'week', '6m': 'week', '1y': 'month', all: 'month' };

function windowFor(range: AnalyticsRange, c: Clock): Window {
  switch (range) {
    case '24h':
      return hourly(c);
    case '7d':
      return daily(7, c);
    case '30d':
      return daily(30, c);
    case '3m':
      return weekly(13, c);
    case '6m':
      return weekly(26, c);
    case '1y':
      return monthly(12, c);
    case 'all':
      return monthly('all', c);
  }
}

/** GET /analytics for one range, computed for "now". */
export function analyticsFor(range: AnalyticsRange, nowMs: number = Date.now()): Analytics {
  const c = clock(nowMs);
  const bucket = BUCKET[range];
  const w = windowFor(range, c);

  if (state.empty) {
    return {
      range,
      bucket,
      total: 0,
      prevTotal: null,
      change: null,
      average: 0,
      averagePer: range === '24h' ? 'hour' : 'day',
      peak: null,
      trackingSince: null,
      series: w.points.map((p) => ({ ...p, count: 0 })),
      topSources: [],
      devices: [],
      topPages: [],
      countries: [],
      topReferrers: [],
    };
  }

  const total = w.points.reduce((a, p) => a + p.count, 0);
  // Today counts as the share of it that has gone by, so the average is not dragged down at 9 AM.
  const elapsedDays = range === '24h' ? 24 : Math.max(w.days - 1 + elapsedShare(c), 1);
  const peak = w.points.reduce<AnalyticsPoint | null>((best, p) => (p.count > 0 && (!best || p.count >= best.count) ? p : best), null);
  const flags = new Map(COUNTRIES.map(([label, flag]) => [label, flag]));
  // Every pageview has a country: the list adds up to the total.
  const countries: CountryCount[] = partition(
    total,
    COUNTRIES.map(([label, , share]): [string, number] => [label, share]),
    range,
  ).map((row) => {
    const flag = flags.get(row.label);
    return flag ? { ...row, flag } : row;
  });

  return {
    range,
    bucket,
    total,
    prevTotal: w.prevTotal,
    change: w.prevTotal ? Math.round(((total - w.prevTotal) / w.prevTotal) * 10_000) / 10_000 : null,
    average: Math.round((total / elapsedDays) * 10) / 10,
    averagePer: range === '24h' ? 'hour' : 'day',
    peak: peak ? { label: peak.label, count: peak.count } : null,
    trackingSince: trackingStart(c),
    series: w.points,
    topSources: partition(total, SOURCES, range),
    devices: partition(total, DEVICES, range),
    topPages: spread(total, PAGES, range).slice(0, 10),
    countries,
    topReferrers: spread(total, REFERRERS, range),
  };
}

/**
 * This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts).
 * Empty: the contract's meta list has nothing for analytics.
 */
export const metaFixture: AnalyticsMeta = {};
