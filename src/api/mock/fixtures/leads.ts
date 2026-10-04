import { addDays, parseCalendarDate, torontoWallTimeToInstant } from '@/lib/dates';
import { env } from '@/lib/env';

import type { Lead, LeadNeed, LeadRevenue, LeadSource, LeadStatus, LeadsMeta, LeadUtm, StaffRef, Touch, TouchKind } from '../../schemas/leads';
import { byNewest, minutesAgo, pick, torontoDate } from '../router';
import { SEED_CLIENTS, SEED_PEOPLE, type SeedClient } from './seed';
import { MOCK_ACCOUNTS } from './staff';
import { hexId, leadIdFor, toolSubmissionsDb } from './tools';

/**
 * Fixtures for the "leads" domain. One table, newest first, about 80 rows so the
 * list pages: booked calls, lead forms (source grow), one lead per free tool
 * submission (fixtures/tools.ts), and portal sign-ups.
 *
 * Anchors line up with other domains:
 * - the inbox (fixtures/notifications.ts): same person, minute, need, revenue and id;
 * - clients (seed.ts): won leads and portal sign-ups point at the client they became;
 * - ads (fixtures/ads.ts): paid leads carry the campaign slugs of the Meta campaigns.
 *
 * Outreach (the website's docs/admin-api/outreach.md): a few leads carry a
 * follow-up (overdue, today, upcoming), an owner from the mock team, and
 * touches (calls, emails, DMs, meetings) logged by that team.
 */

/* ---------- attribution presets ---------- */

type Attribution = { utm: LeadUtm; referrer: string | null };
const utm = (source: string | null, medium: string | null, campaign: string | null, referrer: string | null): Attribution => ({
  utm: { source, medium, campaign },
  referrer,
});

export const ATTRIBUTION = {
  fbWebline: utm('facebook', 'paid_social', 'webline-hamilton-trades', 'https://l.facebook.com/'),
  fbGrowth: utm('facebook', 'paid_social', 'growth-ottawa-home-services', 'https://l.facebook.com/'),
  fbTool: utm('facebook', 'paid_social', 'tool-missed-call', 'https://l.facebook.com/'),
  igRetarget: utm('instagram', 'paid_social', 'retargeting-30d', 'https://l.instagram.com/'),
  google: utm(null, null, null, 'https://www.google.com/'),
  bing: utm(null, null, null, 'https://www.bing.com/'),
  chatgpt: utm('chatgpt.com', null, null, 'https://chatgpt.com/'),
  newsletter: utm('newsletter', 'email', 'sept-roundup', null),
  linkedin: utm('linkedin', 'social', 'founder-posts', 'https://www.linkedin.com/'),
  flyer: utm('flyer', 'qr', 'home-show-2026', null),
  referral: utm(null, null, null, 'https://harbourhvac.test/'),
  direct: utm(null, null, null, null),
} as const;
type AttributionKey = keyof typeof ATTRIBUTION;

/* ---------- builders ---------- */

/** A Cal.com slot: a round Toronto wall time on a calendar day `dayOffset` from today. */
function slot(dayOffset: number, i: number): string {
  const p = parseCalendarDate(addDays(torontoDate(0), dayOffset));
  if (!p) throw new Error('leads fixture: bad date');
  return torontoWallTimeToInstant({ ...p, hour: 9 + (i % 7), minute: i % 2 === 0 ? 0 : 30 });
}

type Spec = {
  id: string;
  minutesAgo: number;
  name: string | null;
  email: string;
  phone: string | null;
  business: string | null;
  status: LeadStatus;
  source: LeadSource;
  need?: LeadNeed | null;
  revenue?: LeadRevenue | null;
  message?: string | null;
  /** Days from today (negative: in the past) for the booked call. */
  bookingInDays?: number;
  attribution: AttributionKey;
  convertedClientId?: string | null;
};

function lead(spec: Spec, i: number): Lead {
  const { utm: tags, referrer } = ATTRIBUTION[spec.attribution];
  return {
    id: spec.id,
    name: spec.name,
    email: spec.email,
    phone: spec.phone,
    business: spec.business,
    status: spec.status,
    source: spec.source,
    need: spec.need ?? null,
    revenue: spec.revenue ?? null,
    message: spec.message ?? null,
    bookingAt: spec.bookingInDays === undefined ? null : slot(spec.bookingInDays, i),
    createdAt: minutesAgo(spec.minutesAgo),
    utm: { ...tags },
    referrer,
    convertedClientId: spec.convertedClientId ?? null,
    website: null,
    followUpAt: null,
    assignedTo: null,
    addedBy: null,
  };
}

const person = (i: number) => SEED_PEOPLE[i % SEED_PEOPLE.length];
function client(id: string): SeedClient {
  const found = SEED_CLIENTS.find((c) => c.id === id);
  if (!found) throw new Error(`leads fixture: unknown seed client ${id}`);
  return found;
}

const MESSAGES = {
  afterHours: 'We miss a lot of calls after 5 and on weekends. Want to stop losing those jobs to whoever picks up first.',
  oldSite: 'Our website is from 2014 and does not work on phones. Need something that actually brings in calls.',
  guarantee: 'Saw your ad. How does the 30 booked appointments guarantee work, and what counts as booked?',
  junkLeads: 'We already spend about $2K a month on Google Ads but most leads are junk. Looking for a second opinion.',
  bookingApp: 'Looking for a booking app for our clinic that syncs with our calendar and sends reminders.',
  video: 'Can you make short videos for Instagram and TikTok? We never have time to film anything.',
  seasonal: 'Busy all summer, dead all winter. Not sure what we need, honestly.',
  referral: 'Priya at Harbour HVAC said you sorted out their phones. We want the same.',
  quote: 'Do you have pricing for a 5 page site? We are a two person shop.',
  long: 'Hi,\n\nWe are a family run company (third generation) doing residential and light commercial work across Hamilton, Burlington and Grimsby. Most of our work comes from referrals, which is great, but it is not enough to keep three crews busy from November to March.\n\nWe tried an agency last year. They built a nice looking site and ran ads, but nobody answered the leads fast enough and we could not tell what we were paying for. We need someone who handles the whole thing: the site, the ads, the follow up, and a simple report.\n\nBest time to reach me is before 8 am or after 6 pm. Thanks.',
} as const;

/* ---------- the inbox anchors (fixtures/notifications.ts) ---------- */

const ANCHORS: Spec[] = [
  { id: hexId('ld', 100), minutesAgo: 11, name: person(0).name, email: person(0).email, phone: person(0).phone, business: 'Martin Family Dentistry', status: 'booked', source: 'cal_booking', need: 'customers', revenue: '20k_50k', message: MESSAGES.afterHours, bookingInDays: 1, attribution: 'fbGrowth' },
  { id: hexId('ld', 201), minutesAgo: 236, name: person(1).name, email: person(1).email, phone: person(1).phone, business: 'Capital Window Cleaning', status: 'new', source: 'grow', need: 'website', revenue: 'under_10k', message: MESSAGES.quote, attribution: 'google' },
  { id: hexId('ld', 104), minutesAgo: 1000, name: person(4).name, email: person(4).email, phone: person(4).phone, business: 'Gauthier Logistics', status: 'booked', source: 'cal_booking', need: 'custom', revenue: '50k_100k', message: MESSAGES.bookingApp, bookingInDays: 1, attribution: 'linkedin' },
  { id: hexId('ld', 105), minutesAgo: 2010, name: person(5).name, email: person(5).email, phone: person(5).phone, business: 'Brown Brothers Landscaping', status: 'booked', source: 'cal_booking', need: 'customers', revenue: '10k_20k', message: MESSAGES.seasonal, bookingInDays: 2, attribution: 'fbGrowth' },
  { id: hexId('ld', 212), minutesAgo: 3100, name: person(12).name, email: person(12).email, phone: person(12).phone, business: 'Hamilton Mobile Dog Grooming', status: 'contacted', source: 'grow', need: 'customers', revenue: 'pre', message: null, attribution: 'igRetarget' },
  { id: hexId('ld', 103), minutesAgo: 7200, name: person(3).name, email: person(3).email, phone: person(3).phone, business: 'Wilson Auto Repair', status: 'cancelled', source: 'cal_booking', need: 'customers', revenue: '20k_50k', message: null, bookingInDays: -2, attribution: 'google' },
  { id: hexId('ld', 217), minutesAgo: 5420, name: person(17).name, email: person(17).email, phone: person(17).phone, business: 'Glanbrook Septic Services', status: 'qualified', source: 'grow', need: 'unsure', revenue: '100k_plus', message: MESSAGES.long, attribution: 'newsletter' },
  { id: hexId('ld', 114), minutesAgo: 6000, name: person(14).name, email: person(14).email, phone: person(14).phone, business: 'Anderson Yoga Studio', status: 'contacted', source: 'cal_booking', need: 'content', revenue: '20k_50k', message: MESSAGES.video, bookingInDays: -1, attribution: 'igRetarget' },
  { id: hexId('ld', 213), minutesAgo: 6900, name: person(13).name, email: person(13).email, phone: person(13).phone, business: 'Stoney Creek Tutoring Centre', status: 'contacted', source: 'grow', need: 'customers', revenue: '10k_20k', message: null, attribution: 'chatgpt' },
  { id: hexId('ld', 111), minutesAgo: 7700, name: person(11).name, email: person(11).email, phone: person(11).phone, business: 'Pelletier Plumbing', status: 'qualified', source: 'cal_booking', need: 'website', revenue: 'under_10k', message: MESSAGES.oldSite, bookingInDays: -2, attribution: 'fbWebline' },
  { id: hexId('ld', 115), minutesAgo: 10_200, name: person(15).name, email: person(15).email, phone: person(15).phone, business: 'Bouchard Home Comfort', status: 'lost', source: 'cal_booking', need: 'customers', revenue: '50k_100k', message: MESSAGES.junkLeads, bookingInDays: -4, attribution: 'google' },
  { id: hexId('ld', 207), minutesAgo: 11_200, name: person(7).name, email: person(7).email, phone: null, business: 'Ottawa Valley Snow & Ice Removal Professionals Incorporated', status: 'new', source: 'grow', need: 'customers', revenue: '20k_50k', message: MESSAGES.seasonal, attribution: 'fbGrowth' },
  { id: hexId('ld', 106), minutesAgo: 12_100, name: person(6).name, email: person(6).email, phone: person(6).phone, business: 'Nguyen Dental Group', status: 'qualified', source: 'cal_booking', need: 'customers', revenue: '100k_plus', message: MESSAGES.guarantee, bookingInDays: -5, attribution: 'fbGrowth' },
  // The portal sign-up in the inbox: Samir Patel, Orleans Auto Detailing (a client in "lead" status).
  { id: hexId('ld', 716), minutesAgo: 1590, name: 'Samir Patel', email: 'samir@orleansauto.test', phone: '+16135550171', business: 'Orleans Auto Detailing', status: 'new', source: 'portal_signup', attribution: 'direct', convertedClientId: 'cl_orleansauto' },
];

/* ---------- leads that became clients (seed.ts) ---------- */

type Won = [clientId: string, source: LeadSource, daysBeforeClient: number, need: LeadNeed, revenue: LeadRevenue, attribution: AttributionKey, message: string | null];

const WON: Won[] = [
  ['cl_acmeplumb01', 'cal_booking', 5, 'customers', '50k_100k', 'fbGrowth', MESSAGES.afterHours],
  ['cl_harbourhvac', 'cal_booking', 6, 'customers', '100k_plus', 'google', null],
  ['cl_bytownroof', 'grow', 9, 'customers', '50k_100k', 'fbGrowth', MESSAGES.guarantee],
  ['cl_rideaulawn', 'cal_booking', 4, 'customers', '20k_50k', 'referral', MESSAGES.referral],
  ['cl_steeltownph', 'grow', 3, 'website', '10k_20k', 'fbWebline', MESSAGES.oldSite],
  ['cl_dundaselec', 'cal_booking', 7, 'customers', '20k_50k', 'flyer', null],
  ['cl_lakeshorecl', 'cal_booking', 4, 'customers', '10k_20k', 'igRetarget', null],
  ['cl_byward_cafe', 'lead_magnet', 12, 'website', 'under_10k', 'fbTool', null],
  ['cl_barrhavenhm', 'cal_booking', 4, 'customers', '50k_100k', 'google', MESSAGES.junkLeads],
  ['cl_nepeanortho', 'cal_booking', 4, 'customers', '100k_plus', 'linkedin', null],
];

function wonLeads(): Spec[] {
  return WON.map(([clientId, source, daysBefore, need, revenue, attribution, message], i) => {
    const c = client(clientId);
    const days = c.ageDays + daysBefore;
    const asks = source === 'cal_booking' || source === 'grow';
    return {
      id: hexId('ld', 700 + i),
      minutesAgo: days * 1440 + 200 + i * 37,
      name: c.contactName,
      email: c.email,
      phone: c.phone,
      business: c.businessName,
      status: 'won',
      source,
      need: asks ? need : null,
      revenue: asks ? revenue : null,
      message: source === 'lead_magnet' ? null : message,
      bookingInDays: source === 'cal_booking' ? -(days - 2) : undefined,
      attribution,
      convertedClientId: c.id,
    };
  });
}

/** The other seeded portal sign-up: Grace Liu, Waterdown Driving School (abandoned checkout). */
const GRACE: Spec = (() => {
  const c = client('cl_waterdown_d');
  return { id: hexId('ld', 715), minutesAgo: c.ageDays * 1440 + 90, name: c.contactName, email: c.email, phone: c.phone, business: c.businessName, status: 'contacted', source: 'portal_signup', attribution: 'google', convertedClientId: c.id };
})();

/* ---------- booked calls and lead forms from other people ---------- */

type Row = [name: string, email: string, phone: string | null, business: string | null];

const OTHERS: Row[] = [
  ['Priya Desai', 'priya@desaidental.test', '+16135550232', 'Desai Dental Studio'],
  ['Elena Petrova', 'elena.p@mailbox.test', null, null],
  ["Ryan O'Neill", 'ryan@oneillelectric.test', '+19055550239', "O'Neill Electric"],
  ['Fatima Noor', 'fatima@noorbeauty.test', '+19055550240', 'Noor Beauty Bar'],
  ['Amira Saleh', 'amira@salehlaw.test', '+16135550244', 'Saleh Immigration Law'],
  ['Natalie Boucher', 'natalie@boucherbakery.test', null, 'Boucher Bakery'],
  ['Karen Liu', 'karen@liuaccounting.test', '+19055550238', 'Liu & Associates Accounting'],
  ['Yusuf Ali', 'yusuf.ali@mailbox.test', '+19055550250', null],
  ['Jessica Park', 'jessica@parkorthodontics.test', '+19055550257', 'Park Orthodontics'],
  ['Hiroshi Tanaka', 'hiroshi@tanakasushi.test', '+16135550263', 'Tanaka Sushi'],
  ['Tanya Ivanova', 'tanya@ivanovanails.test', null, 'Tanya Nails'],
  ['Mia Campbell', 'mia.c@mailbox.test', '+19055550209', 'Campbell Pest Solutions'],
  ['Zoe Ahmed', 'zoe.ahmed@mailbox.test', '+19055550211', 'Sparkle Home Cleaning'],
  ['Layla Hassan', 'layla.h@mailbox.test', '+19055550219', 'Hassan Tutoring'],
  ['Brandon Hughes', 'brandon@hughesfitness.test', '+19055550245', 'Hughes Fitness Studio'],
  ['Sara Lindqvist', 'sara@nordichomes.test', '+16135550255', 'Nordic Custom Homes'],
  ['Dimitri Papadopoulos', 'dimitri@papasgrill.test', '+19055550254', "Papa's Grill & Catering"],
  ['Rebecca Stone', 'rebecca@stonecounselling.test', '+19055550259', 'Stone Counselling'],
  ['Andre Thibault', 'andre@thibaultconstruction.test', '+16135550237', 'Thibault Construction'],
  ['Hannah Mitchell', 'hannah.m@mailbox.test', '+19055550217', 'Mitchell Dog Walking'],
];

const NEEDS: readonly LeadNeed[] = ['customers', 'website', 'customers', 'custom', 'content', 'unsure', 'customers', 'website'];
const REVENUES: readonly LeadRevenue[] = ['under_10k', '10k_20k', '20k_50k', 'pre', '50k_100k', '10k_20k', '100k_plus', '20k_50k'];
const ATTRIBUTIONS: readonly AttributionKey[] = ['google', 'fbGrowth', 'direct', 'fbWebline', 'igRetarget', 'google', 'newsletter', 'bing', 'chatgpt', 'linkedin', 'flyer'];
const NOTES: readonly (string | null)[] = [MESSAGES.quote, null, MESSAGES.guarantee, MESSAGES.video, null, MESSAGES.oldSite, MESSAGES.junkLeads, null, MESSAGES.bookingApp, MESSAGES.seasonal];

function others(): Spec[] {
  return OTHERS.map(([name, email, phone, business], i) => {
    const source: LeadSource = i % 3 === 1 ? 'grow' : 'cal_booking';
    const days = 1.6 + i * 5.7 + (i % 4) * 0.37;
    const older: readonly LeadStatus[] = source === 'grow' ? ['contacted', 'qualified', 'lost', 'contacted', 'new'] : ['contacted', 'qualified', 'lost', 'cancelled', 'contacted', 'qualified'];
    const recent = days < 4;
    const status: LeadStatus = recent ? (source === 'grow' ? 'new' : 'booked') : pick(older, i);
    // Bookings are made 1 to 5 days ahead; a call still booked is always in the future.
    const bookingInDays = Math.round(-days + 1 + (i % 5));
    return {
      id: hexId('ld', 600 + i),
      minutesAgo: Math.round(days * 1440),
      name,
      email,
      phone,
      business,
      status,
      source,
      need: pick(NEEDS, i * 3 + 1),
      revenue: pick(REVENUES, i * 5 + 2),
      message: pick(NOTES, i * 7),
      bookingInDays: source !== 'cal_booking' ? undefined : status === 'booked' ? Math.max(bookingInDays, 1) : Math.min(bookingInDays, -1),
      attribution: pick(ATTRIBUTIONS, i * 7 + 3),
    };
  });
}

/* ---------- one lead per free tool submission (fixtures/tools.ts) ---------- */

function toolLeads(): Lead[] {
  return toolSubmissionsDb.map((s, i) => {
    const ageMinutes = Math.round((Date.now() - Date.parse(s.createdAt.replace(/(\.\d{3})\d+/, '$1'))) / 60_000);
    const ageDays = ageMinutes / 1440;
    const status: LeadStatus = ageDays < 10 ? 'new' : pick(['contacted', 'lost', 'new', 'qualified'] as const, i);
    const attribution = ATTRIBUTION[pick(['fbTool', 'fbTool', 'google', 'newsletter', 'direct'] as const, i)];
    return {
      id: leadIdFor(s.id),
      name: s.name,
      email: s.email,
      phone: null,
      business: s.business,
      status,
      source: 'lead_magnet',
      need: null,
      revenue: null,
      message: null,
      bookingAt: null,
      createdAt: s.createdAt,
      utm: { ...attribution.utm },
      referrer: attribution.referrer,
      convertedClientId: null,
      website: null,
      followUpAt: null,
      assignedTo: null,
      addedBy: null,
    };
  });
}

/** The leads table (mutable in-memory state), newest first. */
export const leadsDb: Lead[] = [
  ...[...ANCHORS, ...wonLeads(), GRACE, ...others()].map((spec, i) => lead(spec, i)),
  ...toolLeads(),
].sort(byNewest((l) => l.createdAt));

/* ---------- outreach: owners, follow-ups and touches ---------- */

/** A mock team member as leads show them. */
function staffRef(accountId: string): StaffRef {
  const account = MOCK_ACCOUNTS.find((a) => a.id === accountId);
  if (!account) throw new Error(`leads fixture: unknown staff ${accountId}`);
  return { email: account.email, name: account.name };
}

/**
 * Everyone a lead can be assigned to (GET /leads/assignees): the mock team,
 * plus env owners who are not fixture accounts, sorted by name (else email).
 * Read on every call: the Team screen adds and removes people.
 */
export function leadAssignees(): StaffRef[] {
  const byEmail = new Map<string, string | null>();
  for (const email of env.mockOwnerEmails) byEmail.set(email.toLowerCase(), null);
  for (const account of MOCK_ACCOUNTS) byEmail.set(account.email.toLowerCase(), account.name?.trim() || null);
  return [...byEmail.entries()]
    .map(([email, name]) => ({ email, name }))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, 'en', { sensitivity: 'base' }));
}

/** A Toronto wall time `dayOffset` calendar days from today. */
function torontoAt(dayOffset: number, hour: number, minute = 0): string {
  const p = parseCalendarDate(addDays(torontoDate(0), dayOffset));
  if (!p) throw new Error('leads fixture: bad date');
  return torontoWallTimeToInstant({ ...p, hour, minute });
}

type TouchSeed = [kind: TouchKind, minutesAgo: number, by: string, outcome: string | null, note: string | null];

type OutreachSeed = {
  leadId: string;
  /** Days from today and the Toronto hour of the next follow-up. */
  followUp?: [dayOffset: number, hour: number];
  assignedTo?: string;
  website?: string;
  touches?: TouchSeed[];
};

const STAFF = 'usr_staff01';
const MANAGER = 'usr_mgr01';
const OWNER = 'usr_owner01';

const OUTREACH: OutreachSeed[] = [
  // Due later today: a new lead form, nobody has called yet.
  { leadId: hexId('ld', 201), followUp: [0, 16], assignedTo: STAFF },
  // Overdue: two tries, no answer yet.
  {
    leadId: hexId('ld', 212),
    followUp: [-2, 10],
    assignedTo: STAFF,
    website: 'instagram.com/hamiltonmobilegrooming',
    touches: [
      ['email', 2 * 1440 + 140, STAFF, 'Sent the free audit link', 'Asked which days they are busiest so we can show the missed calls.'],
      ['call', 3 * 1440 + 65, STAFF, 'Left a voicemail', null],
    ],
  },
  // Upcoming, owned by the manager.
  {
    leadId: hexId('ld', 213),
    followUp: [3, 11],
    assignedTo: MANAGER,
    touches: [
      ['meeting', 1440 + 300, MANAGER, 'Walked through the plan', 'Wants to start after the fall term rush.\nSend a short proposal by Friday.'],
      ['call', 4 * 1440 + 30, STAFF, 'Wants a quote', null],
    ],
  },
  // Tomorrow morning, the owner's own lead.
  {
    leadId: hexId('ld', 217),
    followUp: [1, 10],
    assignedTo: OWNER,
    website: 'glanbrookseptic.test',
    touches: [
      ['email', 600, OWNER, 'Sent the proposal', null],
      ['meeting', 2 * 1440 + 200, OWNER, 'Good fit', 'Three trucks, two dispatchers. Biggest leak: weekend calls going to voicemail.'],
      ['call', 3 * 1440 + 400, MANAGER, 'Booked a meeting', null],
    ],
  },
  // Overdue since yesterday afternoon: they replied on Instagram.
  {
    leadId: hexId('ld', 114),
    followUp: [-1, 14],
    assignedTo: STAFF,
    touches: [['dm', 1440 + 500, STAFF, 'Replied on Instagram', 'Asked for examples of short videos for studios.']],
  },
  // Due first thing today, nobody owns it yet (no phone on this lead).
  { leadId: hexId('ld', 207), followUp: [0, 9] },
  // Next week.
  {
    leadId: hexId('ld', 111),
    followUp: [6, 13],
    assignedTo: MANAGER,
    touches: [['call', 2 * 1440 + 90, MANAGER, 'Call back after their busy season', null]],
  },
  // Lost after a few tries: no follow-up planned.
  {
    leadId: hexId('ld', 115),
    touches: [
      ['other', 9 * 1440, MANAGER, 'Marked lost', 'Went with their nephew for the website.'],
      ['call', 10 * 1440 + 30, STAFF, 'Not interested right now', null],
    ],
  },
];

/** Every touch, newest first (GET /leads/:id/touches filters by lead). Mutable in-memory state. */
export const leadTouchesDb: Touch[] = [];

for (const seed of OUTREACH) {
  const row = leadsDb.find((l) => l.id === seed.leadId);
  if (!row) throw new Error(`leads fixture: unknown outreach lead ${seed.leadId}`);
  if (seed.followUp) row.followUpAt = torontoAt(seed.followUp[0], seed.followUp[1]);
  if (seed.assignedTo) row.assignedTo = staffRef(seed.assignedTo);
  if (seed.website) row.website = seed.website;
  (seed.touches ?? []).forEach(([kind, ago, by, outcome, note], i) => {
    leadTouchesDb.push({
      id: `tc_${seed.leadId.slice(3)}${i}`,
      leadId: seed.leadId,
      kind,
      outcome,
      note,
      by: staffRef(by),
      at: minutesAgo(ago),
    });
  });
}
leadTouchesDb.sort(byNewest((t) => t.at));

export const findLead = (id: string) => leadsDb.find((l) => l.id === id);

/** Newest leads (Home "Recent leads" reads 8). */
export const recentLeads = (count: number) => leadsDb.slice(0, count);

/** Home KPIs: every lead, and the ones with a call booked. */
export const leadCounts = () => ({ total: leadsDb.length, booked: leadsDb.filter((l) => l.status === 'booked').length });

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). Labels are the website's. */
export const metaFixture: LeadsMeta = {
  leadSources: [
    { value: 'cal_booking', label: 'Booked call' },
    { value: 'grow', label: 'Lead form' },
    { value: 'lead_magnet', label: 'Free tool' },
    { value: 'portal_signup', label: 'Portal sign-up' },
    { value: 'outreach', label: 'Outreach' },
  ],
  leadStatuses: [
    { value: 'new', label: 'New', tone: 'gold' },
    { value: 'booked', label: 'Booked', tone: 'ok' },
    { value: 'contacted', label: 'Contacted', tone: 'muted' },
    { value: 'qualified', label: 'Qualified', tone: 'muted' },
    { value: 'won', label: 'Won', tone: 'muted' },
    { value: 'lost', label: 'Lost', tone: 'muted' },
    { value: 'cancelled', label: 'Cancelled', tone: 'muted' },
  ],
  leadNeeds: [
    { value: 'customers', label: 'More customers and booked jobs' },
    { value: 'website', label: 'A new or better website' },
    { value: 'custom', label: 'A custom build: AI, app or software' },
    { value: 'content', label: 'Content and motion graphics' },
    { value: 'unsure', label: 'Not sure yet, I want to talk it through' },
  ],
  leadRevenueBands: [
    { value: 'pre', label: 'Just starting, no revenue yet' },
    { value: 'under_10k', label: 'Under $10K a month' },
    { value: '10k_20k', label: '$10K to $20K a month' },
    { value: '20k_50k', label: '$20K to $50K a month' },
    { value: '50k_100k', label: '$50K to $100K a month' },
    { value: '100k_plus', label: '$100K+ a month' },
  ],
  leadTouchKinds: [
    { value: 'call', label: 'Call' },
    { value: 'email', label: 'Email' },
    { value: 'dm', label: 'DM' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'other', label: 'Other' },
  ],
};
