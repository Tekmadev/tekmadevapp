import { addDays, daysBetween, todayToronto, torontoParts } from '@/lib/dates';

import type { AdsAd, AdsCampaign, AdsCampaignStatus, AdsConnectedReport, AdsLastSync, AdsMeta, AdsRange } from '../../schemas/ads';
import { minutesAgo } from '../router';

/**
 * Fixtures for the "ads" domain (Meta ads, owner only). Like analytics, the
 * numbers are derived per ad and per Toronto day from a stable hash, so every
 * range adds up: the days chart sums to the totals, campaigns sum to the totals,
 * and ads sum to their campaign.
 *
 * Campaign slugs match the UTM campaigns on leads and orders (fixtures/leads.ts,
 * fixtures/billing.ts). Mutable state (connection, last sync, the refresh counter)
 * lives in `adsState`; tests flip it with `adsMock`.
 */

const META_ERROR = 'Meta refused the pull: the access token expired.';

export const adsState: { connected: boolean; lastSync: AdsLastSync | null; refreshCalls: number } = {
  connected: true,
  // Matches the inbox: the "Meta pull failed" row is about six hours old.
  lastSync: { at: minutesAgo(361), ok: false, error: META_ERROR },
  refreshCalls: 0,
};

export const adsMock = {
  /** false: no Meta ad account id or token on the server (the "not connected" card). */
  setConnected(connected: boolean) {
    adsState.connected = connected;
  },
  reset() {
    adsState.connected = true;
    adsState.lastSync = { at: minutesAgo(361), ok: false, error: META_ERROR };
    adsState.refreshCalls = 0;
  },
};

/** The ad account the inbox row points at (entity id of "Meta pull failed"). */
export const AD_ACCOUNT_ID = 'act_1048893';
export const META_PULL_ERROR = META_ERROR;

/* ---------- campaigns ---------- */

type AdSpec = { id: string; name: string; weight: number };
type CampaignSpec = {
  id: string;
  name: string;
  /** UTM campaign slug the ads link with. */
  slug: string;
  status: AdsCampaignStatus;
  startDaysAgo: number;
  /** Last day it ran (days ago); null while it runs. */
  endDaysAgo: number | null;
  /** Daily budget, cents. */
  budget: number;
  /** Cost per 1,000 impressions, cents. */
  cpm: number;
  /** Link clicks per impression. */
  ctr: number;
  /** Site visits recorded per link click (some clicks bounce before the page loads). */
  visitRate: number;
  leadRate: number;
  bookRate: number;
  saleRate: number;
  /** What one sale is worth, cents. */
  saleValue: number;
  ads: AdSpec[];
};

const CAMPAIGNS: CampaignSpec[] = [
  {
    id: '120214739020180041',
    name: 'Webline: Hamilton trades',
    slug: 'webline-hamilton-trades',
    status: 'active',
    startDaysAgo: 150,
    endDaysAgo: null,
    budget: 2_800,
    cpm: 1_140,
    ctr: 0.016,
    visitRate: 0.78,
    leadRate: 0.055,
    bookRate: 0.3,
    saleRate: 0.12,
    saleValue: 99_700,
    ads: [
      { id: '120214739020180112', name: 'Video: a $997 site that books jobs', weight: 0.45 },
      { id: '120214739020180113', name: 'Carousel: before and after sites', weight: 0.35 },
      { id: '120214739020180114', name: 'Static: plumber homepage mockup', weight: 0.2 },
    ],
  },
  {
    id: '120215902277640017',
    name: 'Growth System: Ottawa home services',
    slug: 'growth-ottawa-home-services',
    status: 'active',
    startDaysAgo: 120,
    endDaysAgo: null,
    budget: 4_500,
    cpm: 1_480,
    ctr: 0.012,
    visitRate: 0.74,
    leadRate: 0.045,
    bookRate: 0.42,
    saleRate: 0.1,
    saleValue: 249_700,
    ads: [
      { id: '120215902277640201', name: 'Video: 30 booked calls in 60 days', weight: 0.55 },
      { id: '120215902277640202', name: 'Testimonial: Harbour HVAC', weight: 0.3 },
      { id: '120215902277640203', name: 'Static: the guarantee, in plain words', weight: 0.15 },
    ],
  },
  {
    id: '120217120845530023',
    name: 'Free tool: missed-call calculator',
    slug: 'tool-missed-call',
    status: 'active',
    startDaysAgo: 75,
    endDaysAgo: null,
    budget: 1_500,
    cpm: 920,
    ctr: 0.023,
    visitRate: 0.81,
    leadRate: 0.12,
    bookRate: 0.08,
    saleRate: 0.1,
    saleValue: 99_700,
    ads: [
      { id: '120217120845530301', name: 'Static: how much are missed calls costing you?', weight: 0.6 },
      { id: '120217120845530302', name: 'Video: the 30 second leak check', weight: 0.4 },
    ],
  },
  {
    id: '120214990013370052',
    name: 'Retargeting: site visitors 30 days',
    slug: 'retargeting-30d',
    status: 'active',
    startDaysAgo: 140,
    endDaysAgo: null,
    budget: 850,
    cpm: 1_890,
    ctr: 0.019,
    visitRate: 0.85,
    leadRate: 0.08,
    bookRate: 0.35,
    saleRate: 0.15,
    saleValue: 99_700,
    ads: [
      { id: '120214990013370401', name: 'Carousel: what you get with Webline', weight: 0.5 },
      { id: '120214990013370402', name: 'Static: Klarna and Afterpay accepted', weight: 0.5 },
    ],
  },
  {
    id: '120218344102950031',
    name: 'Webline: fall offer, pay in 4',
    slug: 'webline-fall-bnpl',
    status: 'paused',
    startDaysAgo: 45,
    endDaysAgo: 12,
    budget: 2_000,
    cpm: 1_050,
    ctr: 0.018,
    visitRate: 0.79,
    leadRate: 0.05,
    bookRate: 0.25,
    saleRate: 0.15,
    saleValue: 99_700,
    ads: [{ id: '120218344102950501', name: 'Static: pay in 4 with Klarna', weight: 1 }],
  },
  {
    id: '120209876543210009',
    name: 'Brand test: founder video',
    slug: 'brand-founder-video',
    status: 'archived',
    startDaysAgo: 330,
    endDaysAgo: 280,
    budget: 1_200,
    cpm: 800,
    ctr: 0.007,
    visitRate: 0.7,
    leadRate: 0.02,
    bookRate: 0.2,
    saleRate: 0,
    saleValue: 0,
    ads: [{ id: '120209876543210601', name: 'Video: why I started Tekmadev', weight: 1 }],
  },
];

/* ---------- per ad, per day ---------- */

function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Whole outcomes from an expected value: floor plus a stable coin flip for the fraction. */
const draw = (expected: number, key: string) => Math.floor(expected + noise(key));

type AdDay = { spend: number; impressions: number; linkClicks: number; visits: number; leads: number; booked: number; sales: number; revenue: number };

const ZERO: AdDay = { spend: 0, impressions: 0, linkClicks: 0, visits: 0, leads: 0, booked: 0, sales: 0, revenue: 0 };

function adDay(c: CampaignSpec, ad: AdSpec, date: string, age: number, todayShare: number): AdDay {
  if (age > c.startDaysAgo || (c.endDaysAgo !== null && age < c.endDaysAgo)) return ZERO;
  const k = `${ad.id}:${date}`;
  const share = age === 0 ? todayShare : 1;
  const spend = Math.round(c.budget * ad.weight * (0.8 + 0.4 * noise(`${k}:s`)) * share);
  if (spend <= 0) return ZERO;
  const impressions = Math.round((spend / c.cpm) * 1000 * (0.9 + 0.2 * noise(`${k}:i`)));
  const linkClicks = Math.round(impressions * c.ctr * (0.8 + 0.4 * noise(`${k}:c`)));
  const visits = Math.min(linkClicks, Math.round(linkClicks * c.visitRate * (0.9 + 0.2 * noise(`${k}:v`))));
  const leads = draw(visits * c.leadRate, `${k}:l`);
  const booked = Math.min(leads, draw(leads * c.bookRate, `${k}:b`));
  const sales = Math.min(booked, draw(booked * c.saleRate, `${k}:x`));
  return { spend, impressions, linkClicks, visits, leads, booked, sales, revenue: sales * c.saleValue };
}

const add = (a: AdDay, b: AdDay): AdDay => ({
  spend: a.spend + b.spend,
  impressions: a.impressions + b.impressions,
  linkClicks: a.linkClicks + b.linkClicks,
  visits: a.visits + b.visits,
  leads: a.leads + b.leads,
  booked: a.booked + b.booked,
  sales: a.sales + b.sales,
  revenue: a.revenue + b.revenue,
});

const RANGE_DAYS: Record<AdsRange, number> = { '7d': 7, '14d': 14, '30d': 30, '3m': 90, all: 365 };

const cad = (amount: number) => ({ amount, currency: 'CAD' });
const per = (spend: number, count: number) => (count > 0 ? cad(Math.round(spend / count)) : null);

/** The connected GET /ads report for a range, computed for "now". */
export function adsReport(range: AdsRange, nowMs: number = Date.now()): AdsConnectedReport {
  const now = new Date(nowMs);
  const today = todayToronto(now);
  const p = torontoParts(now);
  // Meta spends the daily budget evenly through the day.
  const todayShare = (p.hour * 60 + p.minute) / 1440;
  const n = RANGE_DAYS[range];
  const firstRun = Math.max(...CAMPAIGNS.map((c) => c.startDaysAgo));
  const span = Math.min(n, firstRun + 1);

  const byAd = new Map<string, AdDay>();
  const days: AdsConnectedReport['days'] = [];
  let total = ZERO;
  for (let age = span - 1; age >= 0; age--) {
    const date = addDays(today, -age);
    let day = ZERO;
    for (const c of CAMPAIGNS) {
      for (const ad of c.ads) {
        const row = adDay(c, ad, date, age, todayShare);
        if (row.spend === 0) continue;
        byAd.set(ad.id, add(byAd.get(ad.id) ?? ZERO, row));
        day = add(day, row);
      }
    }
    days.push({ date, spend: cad(day.spend), visits: day.visits });
    total = add(total, day);
  }

  const campaigns: AdsCampaign[] = [];
  const ads: AdsAd[] = [];
  for (const c of CAMPAIGNS) {
    let sum = ZERO;
    for (const ad of c.ads) {
      const a = byAd.get(ad.id);
      if (!a) continue;
      sum = add(sum, a);
      ads.push({
        id: ad.id,
        campaignId: c.id,
        name: ad.name,
        spend: cad(a.spend),
        linkClicks: a.linkClicks,
        visits: a.visits,
        leads: a.leads,
        booked: a.booked,
        sales: a.sales,
        revenue: cad(a.revenue),
        costPerLead: per(a.spend, a.leads),
        costPerSale: per(a.spend, a.sales),
      });
    }
    if (sum.spend === 0) continue;
    campaigns.push({
      id: c.id,
      name: c.name,
      status: c.status,
      spend: cad(sum.spend),
      linkClicks: sum.linkClicks,
      visits: sum.visits,
      leads: sum.leads,
      booked: sum.booked,
      sales: sum.sales,
      revenue: cad(sum.revenue),
      costPerLead: per(sum.spend, sum.leads),
      costPerSale: per(sum.spend, sum.sales),
    });
  }
  campaigns.sort((a, b) => b.spend.amount - a.spend.amount);
  ads.sort((a, b) => b.spend.amount - a.spend.amount);

  // People see an ad several times; frequency creeps up (slowly) over longer windows.
  const reach = Math.round(total.impressions / (1.3 + 0.45 * Math.log(span)));

  return {
    connected: true,
    range,
    lastSync: adsState.lastSync ? { ...adsState.lastSync } : null,
    totals: {
      spend: cad(total.spend),
      impressions: total.impressions,
      reach,
      linkClicks: total.linkClicks,
      ctr: total.impressions > 0 ? Math.round((total.linkClicks / total.impressions) * 10_000) / 10_000 : 0,
      costPerLinkClick: per(total.spend, total.linkClicks),
    },
    outcomes: {
      visits: total.visits,
      leads: total.leads,
      booked: total.booked,
      sales: total.sales,
      revenue: cad(total.revenue),
      roas: total.spend > 0 ? Math.round((total.revenue / total.spend) * 100) / 100 : null,
    },
    cost: {
      perVisit: per(total.spend, total.visits),
      perLead: per(total.spend, total.leads),
      perBooked: per(total.spend, total.booked),
      perSale: per(total.spend, total.sales),
    },
    days,
    campaigns,
    ads,
  };
}

/** Ad-day rows a pull writes: Meta re-sends the last 7 days for late attribution. */
export function refreshRowCount(nowMs: number = Date.now()): number {
  const now = new Date(nowMs);
  const today = todayToronto(now);
  const p = torontoParts(now);
  const todayShare = (p.hour * 60 + p.minute) / 1440;
  let rows = 0;
  for (let age = 6; age >= 0; age--) {
    const date = addDays(today, -age);
    for (const c of CAMPAIGNS) {
      for (const ad of c.ads) if (adDay(c, ad, date, daysBetween(date, today), todayShare).spend > 0) rows += 1;
    }
  }
  return rows;
}

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: AdsMeta = {
  adsCampaignStatuses: [
    { value: 'active', label: 'Active', tone: 'ok' },
    { value: 'paused', label: 'Paused', tone: 'warn' },
    { value: 'archived', label: 'Archived', tone: 'muted' },
  ],
};
