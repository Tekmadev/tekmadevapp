import { ApiError, MESSAGES } from '@/api/errors';
import type { AreaPoint } from '@/components/charts/AreaChart';
import type { DonutDatum } from '@/components/charts/Donut';
import type { HBarDatum } from '@/components/charts/HBars';
import type { MetricColumn, MetricRow } from '@/components/MetricRows';
import type { Stage } from '@/components/StageTracker';
import { addDays, monthName, monthShort, parseCalendarDate, todayToronto, weekdayName, weekdayOf } from '@/lib/dates';

/**
 * Sample data for the Kit screen only. It is deterministic (no Math.random at
 * render) so the screen looks the same every time and screenshots compare.
 * None of it is shown anywhere real data belongs.
 */

/** A smooth, slightly noisy daily series: weekly rhythm, a gentle climb, a dip on one day a week. */
export function sampleValue(i: number): number {
  const weekly = Math.sin((i / 7) * Math.PI * 2) * 180;
  const wobble = Math.sin(i * 1.7) * 60;
  const dip = i % 7 === 5 ? -220 : 0;
  return Math.max(0, Math.round(1200 + i * 22 + weekly + wobble + dip));
}

/** `count` daily points ending today (Toronto), labelled like the API ("Sep 12"). */
export function areaSeries(count = 30, today: string = todayToronto()): AreaPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i - (count - 1));
    const p = parseCalendarDate(date);
    const label = p ? `${monthShort(p.month)} ${p.day}` : date;
    const title = p ? `${weekdayName(weekdayOf(date))}, ${monthName(p.month)} ${p.day}` : date;
    return { label, title, value: sampleValue(i) };
  });
}

/** Nine traffic sources: more than the Donut's seven slots, so "Other" appears. */
export const DONUT_SOURCES: readonly DonutDatum[] = [
  { label: 'Google', count: 4120 },
  { label: 'Direct', count: 2380 },
  { label: 'Instagram', count: 1460 },
  { label: 'Facebook', count: 980 },
  { label: 'LinkedIn', count: 640 },
  { label: 'Email', count: 510 },
  { label: 'YouTube', count: 330 },
  { label: 'Bing', count: 210 },
  { label: 'Referral', count: 140 },
];

export const TOP_PAGES: readonly HBarDatum[] = [
  { label: '/', value: 5210 },
  { label: '/start', value: 3140 },
  { label: '/pricing', value: 2475 },
  { label: '/blog/how-much-does-a-small-business-website-cost-in-ontario', value: 1320 },
  { label: '/free-tools/website-grader', value: 980 },
  { label: '/about', value: 610 },
  { label: '/blog/google-business-profile-checklist', value: 455 },
];

export const COUNTRIES: readonly HBarDatum[] = [
  { label: 'Canada', value: 8120, leading: '🇨🇦' },
  { label: 'United States', value: 1904, leading: '🇺🇸' },
  { label: 'United Kingdom', value: 212, leading: '🇬🇧' },
  { label: 'India', value: 140, leading: '🇮🇳' },
];

/** The eight onboarding stages from the brief (section 8.5). */
export const ONBOARDING_STAGES: readonly Stage[] = [
  { value: 'welcome', label: 'Welcome', days: 1 },
  { value: 'intake', label: 'Intake', days: 3 },
  { value: 'kickoff', label: 'Kickoff', days: 2 },
  { value: 'build', label: 'Build', days: null },
  { value: 'review', label: 'Review', days: 4 },
  { value: 'go_live', label: 'Go live', days: 1 },
  { value: 'optimizing', label: 'Optimizing', days: 30 },
  { value: 'complete', label: 'Complete' },
];

export const METRIC_COLUMNS: readonly MetricColumn[] = [{ label: 'Visits' }, { label: 'Leads', width: 56 }, { label: 'Paid' }];

export const METRIC_ROWS: readonly MetricRow[] = [
  { id: 'google', title: 'Google', subtitle: 'Organic search', values: ['4,120', '38', '$1,204'] },
  { id: 'instagram', title: 'Instagram', subtitle: 'Paid social', values: ['1,460', '12', '$77.50'], tones: [undefined, undefined, 'ok'] },
  { id: 'email', title: 'Email', values: ['510', '0', null], tones: [undefined, 'warn'] },
];

const BUSINESSES = [
  'Acme Plumbing',
  'Northline Roofing',
  'Maple Dental Studio',
  'Harbour Physio',
  'Birchwood Landscaping',
  'Lakeshore Auto Care',
  'Summit Bookkeeping',
  'Riverside Bakery',
  'Cedar Electric',
  'Bluewater HVAC',
];
const CITIES = ['Toronto', 'Hamilton', 'Ottawa', 'London', 'Barrie', 'Kingston', 'Guelph', 'Oshawa'];

export type SampleClient = { id: string; name: string; city: string };

/** A long list for the scrollable sheet demo. */
export function sampleClients(count = 40): SampleClient[] {
  return Array.from({ length: count }, (_, i) => {
    const base = BUSINESSES[i % BUSINESSES.length] ?? 'Client';
    const round = Math.floor(i / BUSINESSES.length);
    return {
      id: `client-${i + 1}`,
      name: round === 0 ? base : `${base} ${round + 1}`,
      city: CITIES[i % CITIES.length] ?? 'Toronto',
    };
  });
}

/** Options for the Select demos (more than 8, so the searchable sheet shows). */
export const PLAN_OPTIONS = [
  { value: 'launch', label: 'Launch', hint: 'One-time website' },
  { value: 'grow', label: 'Grow', hint: 'Website plus care plan' },
  { value: 'scale', label: 'Scale', hint: 'Everything in Grow plus ads' },
] as const;

export const CITY_OPTIONS = [
  'Toronto',
  'Mississauga',
  'Brampton',
  'Hamilton',
  'Ottawa',
  'London',
  'Kitchener',
  'Waterloo',
  'Guelph',
  'Barrie',
  'Kingston',
  'Oshawa',
  'Montréal',
].map((city) => ({ value: city.toLowerCase(), label: city }));

/** A pseudo-random but repeatable integer in [min, max], from a seed. */
export function seeded(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  const unit = x - Math.floor(x);
  return Math.floor(min + unit * (max - min + 1));
}

/** Resolves after `ms`: stands in for a request in the pending demos. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rejects after `ms` with a real ApiError, so the demos show the app's actual failure path. */
export async function failAfter(ms: number, message: string = MESSAGES.unavailable): Promise<never> {
  await delay(ms);
  throw new ApiError({ status: 503, code: 'unavailable', message });
}
