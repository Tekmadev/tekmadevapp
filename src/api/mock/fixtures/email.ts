import type {
  Campaign,
  ConsentEvent,
  EmailOverview,
  EmailTemplate,
  EngagementEvent,
  Subscriber,
  SubscriberDetail,
  SubscriberStatus,
  UnsubscribeReason,
  UnsubscribeSource,
} from '../../schemas/email';
import { daysAgo, minutesAgo, pick } from '../router';
import { SEED_CLIENTS, SEED_PEOPLE } from './seed';

/**
 * Fixtures for the "email" domain. Realistic data, same shapes as the live API.
 * Mutable in-memory state: the email routes (and the CRM resubscribe route)
 * change it, so the overview, lists, details and the CRM inspector agree.
 *
 * Random-looking values come from a seeded generator so fixtures are the same
 * on every reload.
 */

/** Deterministic PRNG (mulberry32): stable fixtures, no Math.random. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The privacy policy version in force now (new consent events carry it). */
export const CURRENT_POLICY_VERSION = '2026-04';
const policyAt = (daysBack: number) => (daysBack > 170 ? '2025-11' : CURRENT_POLICY_VERSION);

/* ------------------------------------------------------------------ */
/* Templates                                                            */
/* ------------------------------------------------------------------ */

const SITE = 'https://www.tekmadev.com';
const track = (key: string, url: string) => `${SITE}/api/email/click?c=${key}&amp;u=${encodeURIComponent(url)}`;

type TemplateSeed = {
  key: string;
  name: string;
  subject: string;
  useWhen: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  button: { label: string; url: string };
  ps?: string;
};

/** Table-based, inline-styled HTML that survives every mail client. Merge tags stay as typed. */
function templateHtml(t: TemplateSeed): string {
  const p = (text: string) =>
    `<tr><td style="padding:0 32px 16px 32px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2a2722;">${text}</td></tr>`;
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${t.subject}</title>`,
    '</head>',
    '<body style="margin:0;padding:0;background-color:#f5f2eb;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.preheader}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f2eb;">',
    '<tr><td align="center" style="padding:32px 12px;">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:16px;">',
    `<tr><td style="padding:32px 32px 8px 32px;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#a17a4f;font-weight:bold;">Tekmadev</td></tr>`,
    `<tr><td style="padding:8px 32px 16px 32px;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:34px;color:#0d0c0a;font-weight:bold;">${t.heading}</td></tr>`,
    p('Hi {{contact.first_name}},'),
    ...t.paragraphs.map(p),
    '<tr><td style="padding:8px 32px 24px 32px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    `<td style="background-color:#0d0c0a;border-radius:999px;"><a href="${track(t.key, t.button.url)}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#f5f2eb;text-decoration:none;">${t.button.label}</a></td>`,
    '</tr></table>',
    '</td></tr>',
    p('Shajeed I.<br>Founder, Tekmadev'),
    ...(t.ps ? [p(`P.S. ${t.ps}`)] : []),
    '</table>',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">',
    `<tr><td align="center" style="padding:20px 32px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#8a857a;">Tekmadev, Hamilton, Ontario, Canada<br>You are getting this because you subscribed at tekmadev.com.<br><a href="{{unsubscribe}}" style="color:#8a857a;text-decoration:underline;">Unsubscribe</a></td></tr>`,
    '</table>',
    `<img src="${SITE}/api/email/open?c=${t.key}&amp;e={{contact.email}}" width="1" height="1" alt="" style="display:block;border:0;">`,
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('\n');
}

/** Sample values for the in-app preview; the tracking pixel is dropped so previews never count as opens. */
function previewOf(html: string): string {
  return html
    .replace(/\{\{contact\.first_name\}\}/g, 'Daniel')
    .replace(/\{\{contact\.email\}\}/g, 'dan@acmeplumbing.test')
    .replace(/\{\{unsubscribe\}\}/g, '#')
    .replace(/<img src="[^"]*\/api\/email\/open[^"]*"[^>]*>/g, '');
}

const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    key: 'welcome',
    name: 'Welcome',
    subject: 'Welcome to Tekmadev',
    useWhen: 'Right after someone subscribes on the website.',
    preheader: 'What to expect from us, and one thing to do today.',
    heading: 'Thanks for subscribing',
    paragraphs: [
      'Once or twice a month you will get one practical idea for turning more calls, forms and messages into booked appointments. No fluff, no daily emails.',
      'If you only do one thing today: call your own business after hours and see what a customer hears. Most owners are surprised.',
    ],
    button: { label: 'Read the speed to lead guide', url: `${SITE}/blog/speed-to-lead-first-five-minutes` },
    ps: 'Reply to this email any time. A real person reads every reply.',
  },
  {
    key: 'free-tool-results',
    name: 'Free tool follow-up',
    subject: 'Your results, and what to fix first',
    useWhen: 'After someone runs a free tool on the website and opts in.',
    preheader: 'The one leak worth fixing before anything else.',
    heading: 'Here is what to fix first',
    paragraphs: [
      'Thanks for running the missed revenue check. The biggest number on your report is usually the slowest reply, not the smallest ad budget.',
      'Fix the first reply before you buy more leads. Every lead you already pay for gets more valuable.',
    ],
    button: { label: 'Book a free call', url: `${SITE}/start` },
  },
  {
    key: 'newsletter',
    name: 'Monthly newsletter',
    subject: 'What is working for local businesses this month',
    useWhen: 'Once a month, to every active subscriber. Add the month to the key, e.g. newsletter-2026-10.',
    preheader: 'Three short ideas from the businesses we work with.',
    heading: 'Three things that worked this month',
    paragraphs: [
      '<strong>1. Two-text reminders.</strong> A clinic in Hamilton cut no-shows with one text the day before and one two hours before.',
      '<strong>2. Service area in the first reply.</strong> A roofing company in Ottawa stopped driving to postal codes it does not cover.',
      '<strong>3. Review asks in person.</strong> Ask right after the customer says something nice, then text the link.',
    ],
    button: { label: 'Read more on the blog', url: `${SITE}/blog` },
  },
  {
    key: 'case-study-dental',
    name: 'Case study spotlight',
    subject: 'How a family dental clinic filled its hygiene schedule',
    useWhen: 'For warm leads who have not booked a call yet.',
    preheader: 'Instant replies and a waiting list that texts itself.',
    heading: 'From open slots to a full schedule',
    paragraphs: [
      'Escarpment Family Dental had open hygiene slots every week and a waiting list nobody called.',
      'Now every web enquiry gets a reply within a minute, and cancellations text the waiting list on their own.',
    ],
    button: { label: 'Read the case study', url: `${SITE}/blog/case-study-family-dental-hygiene-schedule` },
  },
  {
    key: 'win-back',
    name: 'Win-back',
    subject: 'Still thinking it over?',
    useWhen: 'For leads who went quiet after a call or a quote.',
    preheader: 'No pressure. Here is the one question we get most.',
    heading: 'Still thinking it over?',
    paragraphs: [
      'No pressure at all. Most owners we talk to want to know one thing: will this work for a business like mine?',
      'The fastest way to find out is a short call where we look at your real numbers together.',
    ],
    button: { label: 'Pick a time', url: `${SITE}/book` },
    ps: 'If now is not the right time, just reply "later" and we will check back in a few months.',
  },
];

export const emailTemplates: EmailTemplate[] = TEMPLATE_SEEDS.map((t) => {
  const html = templateHtml(t);
  return { key: t.key, name: t.name, subject: t.subject, useWhen: t.useWhen, html, previewHtml: previewOf(html) };
});

/* ------------------------------------------------------------------ */
/* Campaigns and engagement                                             */
/* ------------------------------------------------------------------ */

export type CampaignRecord = Omit<Campaign, 'opens' | 'clicks'>;

export const emailCampaigns: CampaignRecord[] = [
  { id: 'camp_welcome01', key: 'welcome', name: 'Welcome email', subject: 'Welcome to Tekmadev', template: 'welcome', description: 'Sent by the CRM right after signup.', active: true, createdAt: daysAgo(210) },
  { id: 'camp_freetool1', key: 'free-tool-results', name: 'Free tool follow-up', subject: 'Your results, and what to fix first', template: 'free-tool-results', description: null, active: true, createdAt: daysAgo(150) },
  { id: 'camp_news2609', key: 'newsletter-2026-09', name: 'September newsletter', subject: 'What is working for local businesses this month', template: 'newsletter', description: 'Two-text reminders, service areas, review asks.', active: true, createdAt: daysAgo(24) },
  { id: 'camp_news2608', key: 'newsletter-2026-08', name: 'August newsletter', subject: 'Summer is booking season', template: 'newsletter', description: null, active: false, createdAt: daysAgo(54) },
  { id: 'camp_dental01', key: 'case-study-dental', name: 'Dental case study', subject: 'How a family dental clinic filled its hygiene schedule', template: 'case-study-dental', description: 'To warm leads in the dental and clinic segment.', active: true, createdAt: daysAgo(12) },
  // Just added and paused: zero opens, zero clicks.
  { id: 'camp_winback1', key: 'win-back', name: 'Win-back for quiet leads', subject: null, template: 'win-back', description: null, active: false, createdAt: daysAgo(2) },
];

const CLICK_LINKS: Record<string, string[]> = {
  welcome: [`${SITE}/blog/speed-to-lead-first-five-minutes`, `${SITE}/start`],
  'free-tool-results': [`${SITE}/start`, `${SITE}/growth-system`],
  'newsletter-2026-09': [`${SITE}/blog`, `${SITE}/blog/cutting-no-shows-with-two-texts`],
  'newsletter-2026-08': [`${SITE}/blog`, `${SITE}/pricing`],
  'case-study-dental': [`${SITE}/blog/case-study-family-dental-hygiene-schedule`, `${SITE}/start`],
  // A campaign that was deleted: its opens and clicks stay on record.
  'spring-promo': [`${SITE}/webline`],
};

/** The full open and click log (newest first). Never shrinks: deleting a campaign keeps its history. */
export const engagementLog: EngagementEvent[] = (() => {
  const rand = seeded(20260701);
  const plan: { key: string; count: number; fromDays: number; toDays: number }[] = [
    { key: 'welcome', count: 160, fromDays: 60, toDays: 0 },
    { key: 'free-tool-results', count: 90, fromDays: 60, toDays: 0 },
    { key: 'newsletter-2026-09', count: 120, fromDays: 24, toDays: 0 },
    { key: 'newsletter-2026-08', count: 70, fromDays: 54, toDays: 31 },
    { key: 'case-study-dental', count: 34, fromDays: 12, toDays: 0 },
    { key: 'spring-promo', count: 26, fromDays: 60, toDays: 45 },
  ];
  const events: EngagementEvent[] = [];
  let n = 0;
  for (const { key, count, fromDays, toDays } of plan) {
    for (let i = 0; i < count; i++) {
      n += 1;
      const minutesBack = Math.floor((toDays + rand() * (fromDays - toDays)) * 1440) + 1;
      const click = rand() < 0.24;
      const deviceRoll = rand();
      const countryRoll = rand();
      events.push({
        id: `eev_${n.toString(36).padStart(5, '0')}`,
        at: minutesAgo(minutesBack),
        type: click ? 'click' : 'open',
        campaignKey: key,
        link: click ? pick(CLICK_LINKS[key], Math.floor(rand() * 10)) : null,
        device: deviceRoll < 0.62 ? 'mobile' : deviceRoll < 0.95 ? 'desktop' : 'tablet',
        country: countryRoll < 0.86 ? 'Canada' : countryRoll < 0.96 ? 'United States' : null,
      });
    }
  }
  // A few in the last hour so "Recent engagement" looks alive.
  events.push(
    { id: 'eev_live0001', at: minutesAgo(4), type: 'click', campaignKey: 'case-study-dental', link: `${SITE}/start`, device: 'mobile', country: 'Canada' },
    { id: 'eev_live0002', at: minutesAgo(11), type: 'open', campaignKey: 'newsletter-2026-09', link: null, device: 'desktop', country: 'Canada' },
  );
  return events.sort((a, b) => b.at.localeCompare(a.at));
})();

export const RECENT_EVENTS_LIMIT = 25;

export function toCampaign(record: CampaignRecord): Campaign {
  let opens = 0;
  let clicks = 0;
  // Counters start when the campaign was added: re-adding a key starts from 0.
  for (const e of engagementLog) {
    if (e.campaignKey !== record.key || e.at < record.createdAt) continue;
    if (e.type === 'open') opens += 1;
    else clicks += 1;
  }
  return { ...record, opens, clicks };
}

/* ------------------------------------------------------------------ */
/* Subscribers                                                          */
/* ------------------------------------------------------------------ */

export type SubscriberRecord = Subscriber;

/** Erasing this subscriber fails with `crm_erase` (the CRM erasure cannot be queued). */
export const ERASE_FAILS_SUBSCRIBER_ID = 'sub_erasefail1';

/** Addresses erased for good: never pushed to the CRM again (the CRM inspector shows the note). */
export const erasedEmails = new Set<string>(['former.customer@mailbox.test']);

const EXTRA_NAMES = [
  'Amelia Clarke', 'Daniel Roy', 'Grace Wong', 'Henry Lavoie', 'Ivy Patel', 'Jack Moreau', 'Kayla Hughes', 'Leo Bergeron',
  'Maya Singh', 'Nolan Fraser', 'Olive Martin', 'Parker Doyle', 'Quinn Gagne', 'Rosa Alvarez', 'Sam Dube', 'Tara Wallace',
  'Umar Siddiqui', 'Violet Chan', 'Wes Belanger', 'Xavier Leduc', 'Yara Haddad', 'Zach Morin', 'Aria Kowalski', 'Blake Turner',
  'Cora Simard', 'Dylan Park', 'Elena Rossi', 'Finn OConnor',
];

const SIGNUP_SOURCES = ['footer', 'free_tool', 'lead_form', 'blog', 'checkout', 'crm'] as const;

const emailFor = (name: string, i: number) => {
  const [first, last] = name.toLowerCase().split(' ');
  return i % 3 === 0 ? `${first}.${last}@mailbox.test` : i % 3 === 1 ? `${first}${last[0]}@inbox.test` : `${first[0]}${last}@mail.test`;
};

type SubscriberSeed = {
  id: string;
  email: string;
  source: string;
  status: SubscriberStatus;
  daysBack: number;
  inCrm?: boolean;
  country?: string | null;
  reason?: UnsubscribeReason | null;
  unsubscribeSource?: UnsubscribeSource | null;
  leftDaysBack?: number;
  /** Unsubscribed once, then came back. */
  resubscribed?: boolean;
};

/** Hand-written rows: every status, reason and source, plus the CRM inspector scenarios. */
const NAMED: SubscriberSeed[] = [
  // In sync on both sides.
  { id: 'sub_olivia001', email: SEED_PEOPLE[0].email, source: 'lead_form', status: 'active', daysBack: 3 },
  // Unsubscribed here, but the CRM shows them mailable again: "They asked to come back".
  { id: 'sub_noah0001', email: SEED_PEOPLE[1].email, source: 'free_tool', status: 'unsubscribed', daysBack: 140, reason: 'too_many', unsubscribeSource: 'unsubscribe_page', leftDaysBack: 20 },
  // Bounced: can never be revived.
  { id: 'sub_chloe001', email: SEED_PEOPLE[2].email, source: 'footer', status: 'bounced', daysBack: 200, leftDaysBack: 61 },
  // Active, but never pushed: not found in the CRM.
  { id: 'sub_liam0001', email: SEED_PEOPLE[3].email, source: 'blog', status: 'active', daysBack: 1, inCrm: false },
  // Unsubscribed in the CRM, as permanent.
  { id: 'sub_emma0001', email: SEED_PEOPLE[4].email, source: 'checkout', status: 'unsubscribed', daysBack: 180, reason: null, unsubscribeSource: 'crm_permanent', leftDaysBack: 33 },
  // Marked as spam.
  { id: 'sub_ethan001', email: SEED_PEOPLE[5].email, source: 'lead_form', status: 'complained', daysBack: 95, leftDaysBack: 40 },
  { id: 'sub_ava00001', email: SEED_PEOPLE[6].email, source: 'free_tool', status: 'unsubscribed', daysBack: 75, reason: 'not_relevant', unsubscribeSource: 'unsubscribe_page', leftDaysBack: 8 },
  { id: 'sub_lucas001', email: SEED_PEOPLE[7].email, source: 'footer', status: 'unsubscribed', daysBack: 230, reason: 'never_signed_up', unsubscribeSource: 'unsubscribe_page', leftDaysBack: 120, country: 'United States' },
  { id: 'sub_mia00001', email: SEED_PEOPLE[8].email, source: 'blog', status: 'unsubscribed', daysBack: 66, reason: 'other', unsubscribeSource: 'crm', leftDaysBack: 14 },
  { id: 'sub_ben00001', email: SEED_PEOPLE[9].email, source: 'crm', status: 'unsubscribed', daysBack: 300, reason: null, unsubscribeSource: 'admin', leftDaysBack: 90 },
  // Came back after leaving once.
  { id: 'sub_zoe00001', email: SEED_PEOPLE[10].email, source: 'free_tool', status: 'active', daysBack: 160, resubscribed: true, leftDaysBack: 70 },
  { id: 'sub_jacob001', email: SEED_PEOPLE[11].email, source: 'footer', status: 'bounced', daysBack: 45, leftDaysBack: 44, country: null },
  // Long address, no country: layout edge cases.
  { id: 'sub_longaddr1', email: 'accounts.payable.and.general.enquiries@barrhavenhomerenovations-and-design.test', source: 'checkout', status: 'active', daysBack: 22, country: null },
  // Deleting this one fails with crm_erase.
  { id: ERASE_FAILS_SUBSCRIBER_ID, email: 'stuck.erase@mailbox.test', source: 'lead_form', status: 'unsubscribed', daysBack: 120, reason: 'never_signed_up', unsubscribeSource: 'unsubscribe_page', leftDaysBack: 2 },
];

function generated(): SubscriberSeed[] {
  const rand = seeded(424242);
  const out: SubscriberSeed[] = [];
  SEED_PEOPLE.slice(12).forEach((person, i) => {
    out.push({ id: `sub_seedp${i.toString().padStart(3, '0')}`, email: person.email, source: pick(SIGNUP_SOURCES, i), status: 'active', daysBack: 5 + Math.floor(rand() * 250) });
  });
  SEED_CLIENTS.filter((c) => !c.isTest).forEach((client, i) => {
    out.push({ id: `sub_client${i.toString().padStart(2, '0')}`, email: client.email, source: i % 2 === 0 ? 'checkout' : 'lead_form', status: 'active', daysBack: client.ageDays });
  });
  EXTRA_NAMES.forEach((name, i) => {
    const roll = rand();
    const status: SubscriberStatus = roll < 0.86 ? 'active' : roll < 0.95 ? 'unsubscribed' : 'bounced';
    const daysBack = i < 9 ? Math.floor(rand() * 29) : 30 + Math.floor(rand() * 280);
    out.push({
      id: `sub_gen${i.toString().padStart(4, '0')}`,
      email: emailFor(name, i),
      source: pick(SIGNUP_SOURCES, Math.floor(rand() * 60)),
      status,
      daysBack,
      inCrm: rand() > 0.12,
      country: rand() < 0.88 ? 'Canada' : 'United States',
      reason: status === 'unsubscribed' ? pick(['too_many', 'not_relevant', 'other'] as const, i) : null,
      unsubscribeSource: status === 'unsubscribed' ? pick(['unsubscribe_page', 'crm'] as const, i) : null,
      leftDaysBack: status === 'active' ? undefined : Math.max(0, daysBack - 10),
    });
  });
  return out;
}

/** Consent history per subscriber id, oldest first. */
export const consentHistory = new Map<string, ConsentEvent[]>();

function seedSubscriber(seed: SubscriberSeed): SubscriberRecord {
  // Hour offsets keep the order right on the same day: signup, then leaving, then the reason.
  const signedUpAt = daysAgo(seed.daysBack, 3);
  const leftAt = seed.leftDaysBack !== undefined ? daysAgo(Math.min(seed.leftDaysBack, seed.daysBack), 1) : null;
  const events: ConsentEvent[] = [{ at: signedUpAt, event: 'subscribed', source: seed.source, policyVersion: policyAt(seed.daysBack) }];
  if (seed.resubscribed && leftAt) {
    events.push({ at: leftAt, event: 'unsubscribed', source: 'unsubscribe_page', policyVersion: policyAt(seed.leftDaysBack ?? 0) });
    events.push({ at: daysAgo((seed.leftDaysBack ?? 0) - 10), event: 'resubscribed', source: 'footer', policyVersion: CURRENT_POLICY_VERSION });
  } else if (seed.status === 'unsubscribed' && leftAt) {
    const source = seed.unsubscribeSource ?? 'unsubscribe_page';
    events.push(seed.reason ? { at: leftAt, event: 'unsubscribed', source, policyVersion: policyAt(seed.leftDaysBack ?? 0), reason: seed.reason } : { at: leftAt, event: 'unsubscribed', source, policyVersion: policyAt(seed.leftDaysBack ?? 0) });
    if (seed.reason) {
      // "Said why they left": a moment after the unsubscribe, from the same page.
      const reasonAt = daysAgo(Math.min(seed.leftDaysBack ?? 0, seed.daysBack), 0.95);
      events.push({ at: reasonAt, event: 'reason', source, policyVersion: policyAt(seed.leftDaysBack ?? 0), reason: seed.reason });
    }
  } else if ((seed.status === 'bounced' || seed.status === 'complained') && leftAt) {
    events.push({ at: leftAt, event: seed.status, source: 'crm', policyVersion: null });
  }
  consentHistory.set(seed.id, events);
  const left = seed.status !== 'active';
  return {
    id: seed.id,
    email: seed.email,
    source: seed.source,
    status: seed.status,
    reason: seed.status === 'unsubscribed' ? (seed.reason ?? null) : null,
    unsubscribeSource: seed.status === 'unsubscribed' ? (seed.unsubscribeSource ?? 'unsubscribe_page') : null,
    inCrm: seed.inCrm ?? true,
    country: seed.country === undefined ? 'Canada' : seed.country,
    signedUpAt,
    unsubscribedAt: left ? leftAt : null,
  };
}

export const subscribers: SubscriberRecord[] = [...NAMED, ...generated()].map(seedSubscriber);

export const findSubscriber = (id: string) => subscribers.find((s) => s.id === id);
export const findSubscriberByEmail = (email: string) => {
  const needle = email.trim().toLowerCase();
  return subscribers.find((s) => s.email.toLowerCase() === needle);
};

/** Newest first, as the timeline shows it. */
export function consentFor(id: string): ConsentEvent[] {
  return [...(consentHistory.get(id) ?? [])].sort((a, b) => b.at.localeCompare(a.at));
}

export function addConsentEvent(id: string, event: ConsentEvent) {
  const list = consentHistory.get(id) ?? [];
  list.push(event);
  consentHistory.set(id, list);
}

export function toSubscriberDetail(record: SubscriberRecord): SubscriberDetail {
  return { subscriber: { ...record }, consentHistory: consentFor(record.id) };
}

export function emailOverview(): EmailOverview {
  const since = daysAgo(30);
  let opens30d = 0;
  let clicks30d = 0;
  for (const e of engagementLog) {
    if (e.at < since) continue;
    if (e.type === 'open') opens30d += 1;
    else clicks30d += 1;
  }
  return {
    stats: {
      activeSubscribers: subscribers.filter((s) => s.status === 'active').length,
      new30d: subscribers.filter((s) => s.signedUpAt >= since).length,
      opens30d,
      clicks30d,
    },
    campaigns: [...emailCampaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toCampaign),
    recentEvents: engagementLog.slice(0, RECENT_EVENTS_LIMIT),
  };
}

/* ------------------------------------------------------------------ */
/* GET /meta                                                            */
/* ------------------------------------------------------------------ */

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture = {
  subscriberStatuses: [
    { value: 'active' as const, label: 'Active', tone: 'gold' as const },
    { value: 'unsubscribed' as const, label: 'Unsubscribed', tone: 'muted' as const },
    { value: 'bounced' as const, label: 'Bounced', tone: 'muted' as const },
    { value: 'complained' as const, label: 'Complained', tone: 'muted' as const },
  ],
  unsubscribeReasons: [
    { value: 'too_many' as const, label: 'Too many emails' },
    { value: 'not_relevant' as const, label: 'Not relevant to me' },
    { value: 'never_signed_up' as const, label: 'I never signed up' },
    { value: 'other' as const, label: 'Something else' },
  ],
  unsubscribeSources: [
    { value: 'unsubscribe_page' as const, label: 'via the unsubscribe page' },
    { value: 'crm' as const, label: 'via the CRM' },
    { value: 'crm_permanent' as const, label: 'via the CRM, as permanent' },
    { value: 'admin' as const, label: 'via the admin' },
  ],
  subscriberSources: [
    { value: 'footer', label: 'Website footer' },
    { value: 'free_tool', label: 'Free tool' },
    { value: 'lead_form', label: 'Lead form' },
    { value: 'blog', label: 'Blog' },
    { value: 'checkout', label: 'Checkout' },
    { value: 'crm', label: 'CRM' },
    { value: 'unsubscribe_page', label: 'Unsubscribe page' },
    { value: 'crm_permanent', label: 'CRM' },
    { value: 'admin', label: 'Admin' },
  ],
  consentEvents: [
    { value: 'subscribed' as const, label: 'Subscribed' },
    { value: 'resubscribed' as const, label: 'Resubscribed' },
    { value: 'unsubscribed' as const, label: 'Unsubscribed' },
    { value: 'bounced' as const, label: 'Bounced' },
    { value: 'complained' as const, label: 'Marked as spam' },
    { value: 'reason' as const, label: 'Said why they left' },
  ],
  campaignStatuses: [
    { value: 'active' as const, label: 'Active', tone: 'gold' as const },
    { value: 'paused' as const, label: 'Paused', tone: 'muted' as const },
  ],
  engagementTypes: [
    { value: 'open' as const, label: 'Open', tone: 'muted' as const },
    { value: 'click' as const, label: 'Click', tone: 'gold' as const },
  ],
};
