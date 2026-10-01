import { formatCents } from '@/lib/money';

import type { ToolsMeta, ToolStats, ToolSubmission, ToolSubmissionDetail } from '../../schemas/tools';
import { byNewest, minutesAgo, pick } from '../router';
import { SEED_PEOPLE } from './seed';

/**
 * Fixtures for the "tools" domain: submissions of the website's free calculators.
 * Every submission also becomes a lead (source lead_magnet, see fixtures/leads.ts),
 * linked both ways through `leadIdFor`.
 *
 * Four anchors match the inbox (fixtures/notifications.ts): same person, same
 * minute, same leak, same opt-in, same id.
 */

/** Deterministic ids, same scheme as the notifications fixture so links line up. */
export const hexId = (prefix: string, n: number) => `${prefix}_${((n * 2654435761) % 4294967296).toString(16).padStart(8, '0')}`;

/** The lead a submission created: same suffix, "ld_" prefix. */
export const leadIdFor = (submissionId: string) => `ld_${submissionId.slice(submissionId.indexOf('_') + 1)}`;

const TOOLS = {
  'missed-call-leak': 'Missed-call leak calculator',
  'speed-to-lead': 'Speed-to-lead calculator',
} as const;
type ToolKey = keyof typeof TOOLS;

/** The reply-speed answers on both forms, and the close rate a reply in under 5 minutes adds. */
const REPLY_SPEEDS = ['Within 5 minutes', 'Within an hour', 'Same day', 'Next day or later'] as const;
type ReplySpeed = (typeof REPLY_SPEEDS)[number];
const SPEED_LIFT: Record<ReplySpeed, number> = {
  'Within 5 minutes': 0.05,
  'Within an hour': 0.1,
  'Same day': 0.15,
  'Next day or later': 0.2,
};

type Inputs = {
  tool: ToolKey;
  industry: string;
  /** Missed calls (missed-call tool) or new leads (speed-to-lead tool) a month. */
  volume: number;
  closeBefore: number;
  /** Average job or sale value, cents. */
  valueCents: number;
  replySpeed: ReplySpeed | null;
};

/** Internal record: the API row plus what the person typed, so the breakdown is computed, not stored. */
export type ToolSubmissionRecord = ToolSubmission & { inputs: Inputs };

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString();
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What the calculator works out (the same formulas the website uses for the email). */
function compute(inputs: Inputs): { leak: number; before: number; after: number } {
  const before = inputs.closeBefore;
  if (inputs.tool === 'missed-call-leak') {
    // Every missed call would have closed at today's rate; answering every call adds 15 points.
    const after = round2(Math.min(before + 0.15, 0.7));
    return { leak: Math.round(inputs.volume * before * inputs.valueCents), before, after };
  }
  const after = round2(Math.min(before + (inputs.replySpeed ? SPEED_LIFT[inputs.replySpeed] : 0.1), 0.7));
  return { leak: Math.round(inputs.volume * (after - before) * inputs.valueCents), before, after };
}

function answersFor(inputs: Inputs): ToolSubmissionDetail['answers'] {
  if (inputs.tool === 'missed-call-leak') {
    return [
      { label: 'Business type', value: inputs.industry },
      { label: 'Calls missed in a typical month', value: String(inputs.volume) },
      { label: 'Average job value', value: formatCents(inputs.valueCents) },
      { label: 'How fast you call back a missed call', value: inputs.replySpeed ?? 'Skipped' },
      { label: 'Share of answered calls that book', value: inputs.closeBefore > 0 ? pct(inputs.closeBefore) : 'Skipped' },
    ];
  }
  return [
    { label: 'Business type', value: inputs.industry },
    { label: 'New leads a month', value: String(inputs.volume) },
    { label: 'How fast you reply to a new lead today', value: inputs.replySpeed ?? 'Skipped' },
    { label: 'Share of leads that become customers', value: inputs.closeBefore > 0 ? pct(inputs.closeBefore) : 'Skipped' },
    { label: 'Average sale value', value: formatCents(inputs.valueCents) },
  ];
}

function resultFor(inputs: Inputs): ToolSubmissionDetail['result'] {
  const { leak, before, after } = compute(inputs);
  if (inputs.closeBefore <= 0) {
    // Without a close rate the tool cannot work out a number, and says so.
    return [
      { label: inputs.tool === 'missed-call-leak' ? 'Missed calls a month' : 'New leads a month', value: String(inputs.volume) },
      { label: 'Revenue leaking each month', value: 'Not worked out: the close rate was skipped', emphasis: true },
    ];
  }
  if (inputs.tool === 'missed-call-leak') {
    return [
      { label: 'Missed calls a month', value: String(inputs.volume) },
      { label: 'Jobs those calls would have booked', value: oneDecimal(inputs.volume * before) },
      { label: 'Average job value', value: formatCents(inputs.valueCents) },
      { label: 'Revenue leaking each month', value: formatCents(leak), emphasis: true },
      { label: 'Revenue leaking each year', value: formatCents(leak * 12) },
      { label: 'Close rate today', value: pct(before) },
      { label: 'Close rate when every call is answered', value: pct(after), emphasis: true },
    ];
  }
  return [
    { label: 'New leads a month', value: String(inputs.volume) },
    { label: 'Reply time today', value: inputs.replySpeed ?? 'Not given' },
    { label: 'Close rate today', value: pct(before) },
    { label: 'Close rate replying in under 5 minutes', value: pct(after), emphasis: true },
    { label: 'Extra customers a month', value: oneDecimal(inputs.volume * (after - before)) },
    { label: 'Revenue left on the table each month', value: formatCents(leak), emphasis: true },
    { label: 'Each year', value: formatCents(leak * 12) },
  ];
}

type Spec = {
  id: string;
  minutesAgo: number;
  name: string | null;
  email: string;
  business: string | null;
  newsletter: boolean;
  inputs: Inputs;
  /** The breakdown email bounced. */
  bounced?: boolean;
};

/** CRM sync for free tools went live about 60 days ago; older submissions never reached it. */
const CRM_SINCE_MINUTES = 60 * 1440;

function record(spec: Spec): ToolSubmissionRecord {
  const { leak, before, after } = compute(spec.inputs);
  return {
    id: spec.id,
    tool: spec.inputs.tool,
    toolName: TOOLS[spec.inputs.tool],
    name: spec.name,
    email: spec.email,
    business: spec.business,
    // No close rate means the tool could not work out a leak: null, never a fake zero.
    leak: spec.inputs.closeBefore > 0 ? { amount: leak, currency: 'CAD' } : null,
    closeRate: spec.inputs.closeBefore > 0 ? { before, after } : null,
    replySpeed: spec.inputs.replySpeed,
    newsletter: spec.newsletter,
    delivered: { email: !spec.bounced, crm: spec.minutesAgo < CRM_SINCE_MINUTES },
    createdAt: minutesAgo(spec.minutesAgo),
    inputs: spec.inputs,
  };
}

const person = (i: number) => SEED_PEOPLE[i % SEED_PEOPLE.length];
const missed = (industry: string, volume: number, closeBefore: number, valueCents: number, replySpeed: ReplySpeed | null): Inputs => ({
  tool: 'missed-call-leak',
  industry,
  volume,
  closeBefore,
  valueCents,
  replySpeed,
});
const speed = (industry: string, volume: number, closeBefore: number, valueCents: number, replySpeed: ReplySpeed | null): Inputs => ({
  tool: 'speed-to-lead',
  industry,
  volume,
  closeBefore,
  valueCents,
  replySpeed,
});

/** The inbox anchors (person index, minutes ago, leak) from fixtures/notifications.ts. */
const ANCHORS: Spec[] = [
  { id: hexId('ts', 302), minutesAgo: 487, name: person(2).name, email: person(2).email, business: 'Roy Kitchen & Bath', newsletter: true, inputs: missed('Renovations', 50, 0.25, 35_000, 'Same day') },
  { id: hexId('ts', 308), minutesAgo: 4700, name: person(8).name, email: person(8).email, business: 'Campbell Pest Solutions', newsletter: false, inputs: missed('Pest control', 45, 0.25, 25_000, 'Next day or later') },
  { id: hexId('ts', 309), minutesAgo: 8900, name: person(9).name, email: person(9).email, business: 'Cote Roofing', newsletter: true, inputs: missed('Roofing', 30, 0.2, 32_500, 'Within an hour') },
  { id: hexId('ts', 301), minutesAgo: 13_300, name: person(1).name, email: person(1).email, business: 'Capital Window Cleaning', newsletter: false, inputs: missed('Window cleaning', 15, 0.15, 38_900, 'Within an hour') },
];

type Row = [name: string | null, email: string, business: string | null, industry: string];

/** More fictional Ontario owners who tried a calculator. */
const PEOPLE: Row[] = [
  ['Marcus Bell', 'marcus@bellandsonsroofing.test', 'Bell & Sons Roofing', 'Roofing'],
  [null, 'info@lakeviewlandscapes.test', 'Lakeview Landscapes', 'Landscaping'],
  ['Connor Murphy', 'connor@murphyhvac.test', 'Murphy Heating & Cooling', 'HVAC'],
  ['Tariq Rahman', 'tariq@rahmanautoglass.test', 'Rahman Auto Glass', 'Auto glass'],
  ['Julie Bergeron', 'julie@bergeronphoto.test', 'Bergeron Photography', 'Photography'],
  ['Kevin Osei', 'kevin@oseiplumbing.test', 'Osei Plumbing', 'Plumbing'],
  [null, 'office@capitalgaragedoors.test', null, 'Garage doors'],
  ['Laura McKenzie', 'laura@mckenziephysio.test', 'McKenzie Physiotherapy', 'Physiotherapy'],
  ['Paul Fraser', 'paul@fraserlandscaping.test', 'Fraser Landscaping', 'Landscaping'],
  ['Megan Walsh', 'megan@walshvet.test', 'Walsh Mobile Vet', 'Veterinary'],
  ['Omar Haddad', 'omar@haddadflooring.test', 'Haddad Flooring', 'Flooring'],
  ['Martin Lavoie', 'martin@lavoiechimney.test', 'Lavoie Chimney Sweep', 'Chimney services'],
  ['Ahmed Karim', 'ahmed@karimappliance.test', 'Karim Appliance Repair', 'Appliance repair'],
  ['Patrick Doyle', 'patrick@doyleirrigation.test', 'Doyle Irrigation', 'Irrigation'],
  ['Brianne Clark', 'brianne@clarkdaycare.test', 'Little Steps Daycare', 'Childcare'],
  ['Steve Kowalski', 'steve@kowalskiconcrete.test', 'Kowalski Concrete', 'Concrete'],
  ['Zoe Ahmed', 'zoe.ahmed@mailbox.test', null, 'Cleaning'],
  ['Hannah Mitchell', 'hannah.m@mailbox.test', 'Mitchell Dog Walking', 'Pet care'],
  ['Andre Thibault', 'andre@thibaultconstruction.test', 'Thibault Construction', 'Renovations'],
  ['Michelle Tremblay', 'michelle@tremblaycleaning.test', 'Tremblay Cleaning Services', 'Cleaning'],
  ['Derek Chan', 'derek@chanmovers.test', 'Chan Brothers Moving', 'Moving'],
  ['Chantal Roy', 'chantal@roypainting.test', 'Roy Painting', 'Painting'],
  ['Nathan Ross', 'nathan.r@mailbox.test', 'Ross Electrical Contracting and Emergency Generator Services', 'Electrician'],
  ['Gurpreet Sandhu', 'gurpreet@sandhutrucking.test', 'Sandhu Trucking', 'Trucking'],
  ['Rebecca Stone', 'rebecca@stonecounselling.test', 'Stone Counselling', 'Counselling'],
  [null, 'hello@ottawaeavestrough.test', 'Ottawa Eavestrough', 'Eavestroughs'],
  ['Layla Hassan', 'layla.h@mailbox.test', 'Hassan Tutoring', 'Tutoring'],
  ['Dimitri Papadopoulos', 'dimitri@papasgrill.test', "Papa's Grill & Catering", 'Catering'],
  ['Caroline Dupuis', 'caroline@dupuisdesign.test', 'Dupuis Interior Design', 'Interior design'],
  ['Vikram Rao', 'vikram@raoit.test', 'Rao IT Solutions', 'IT services'],
  ['Sara Lindqvist', 'sara@nordichomes.test', 'Nordic Custom Homes', 'Home builder'],
  ['Brandon Hughes', 'brandon@hughesfitness.test', 'Hughes Fitness Studio', 'Fitness'],
];

/** Minutes ago for the generated rows: denser recently, about 95 days back. */
const AGES = [95, 610, 1_900, 2_650, 3_400, 5_900, 7_300, 10_100, 11_900, 15_200, 18_400, 21_700, 24_100, 27_800, 31_500, 36_000, 40_300, 45_900, 50_200, 56_100, 61_000, 66_400, 72_800, 78_100, 83_500, 88_900, 94_200, 101_000, 108_500, 115_300, 124_000, 136_000];

function generated(): Spec[] {
  return PEOPLE.map(([name, email, business, industry], i) => {
    const tool: ToolKey = i % 3 === 1 ? 'speed-to-lead' : 'missed-call-leak';
    const replySpeed: ReplySpeed | null = i === 9 ? null : pick(REPLY_SPEEDS, i * 3 + 1);
    const closeBefore = i === 20 ? 0 : pick([0.15, 0.2, 0.25, 0.3, 0.1, 0.35], i * 5 + 2);
    // Job values with cents now and then (e.g. $387.50), like people type them.
    const valueCents = pick([28_500, 45_000, 38_750, 120_000, 22_000, 65_000, 18_900, 310_000, 52_500], i * 7 + 3);
    const volume = tool === 'missed-call-leak' ? pick([12, 20, 35, 8, 60, 25, 40, 16], i * 3) : pick([30, 45, 80, 20, 120, 55], i * 2);
    return {
      id: hexId('ts', 500 + i),
      minutesAgo: AGES[i] ?? 140_000 + i * 1_000,
      name,
      email,
      business,
      newsletter: i % 5 !== 2 && i % 4 !== 3,
      bounced: i === 14,
      inputs: tool === 'missed-call-leak' ? missed(industry, volume, closeBefore, valueCents, replySpeed) : speed(industry, volume, closeBefore, valueCents, replySpeed),
    };
  });
}

/** The submissions table (mutable in-memory state), newest first. */
export const toolSubmissionsDb: ToolSubmissionRecord[] = [...ANCHORS, ...generated()].map(record).sort(byNewest((s) => s.createdAt));

/** The API row (drops the internal inputs). */
export function toolRow(rec: ToolSubmissionRecord): ToolSubmission {
  const { inputs: _inputs, ...row } = rec;
  return row;
}

export function toolDetail(rec: ToolSubmissionRecord): ToolSubmissionDetail {
  return { ...toolRow(rec), answers: answersFor(rec.inputs), result: resultFor(rec.inputs), leadId: leadIdFor(rec.id) };
}

export const findToolSubmission = (id: string) => toolSubmissionsDb.find((s) => s.id === id);

const DAY_MS = 86_400_000;

export function toolStats(now: number = Date.now()): ToolStats {
  const since = now - 30 * DAY_MS;
  return {
    submissions: toolSubmissionsDb.length,
    last30d: toolSubmissionsDb.filter((s) => Date.parse(s.createdAt.replace(/(\.\d{3})\d+/, '$1')) >= since).length,
    optIns: toolSubmissionsDb.filter((s) => s.newsletter).length,
    leakReported: { amount: toolSubmissionsDb.reduce((sum, s) => sum + (s.leak?.amount ?? 0), 0), currency: 'CAD' },
  };
}

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: ToolsMeta = {};
