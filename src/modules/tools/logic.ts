import type { CloseRate, ToolSubmission, ToolSubmissionPage } from '@/api/schemas/tools';
import type { Tone } from '@/design/tokens';
import { relativeTime } from '@/lib/dates';
import { formatPercent } from '@/lib/format';
import { formatMoney } from '@/lib/money';

/**
 * Pure formatting for the Free tools screens (brief 8.7): rows, badges, the
 * spoken summary of a row, and the sizing of the KPI cards.
 */

/* ---------- rows ---------- */

/** Rows of every loaded page, once each (a submission arriving between page loads shifts the pages). */
export function rowsOf(pages: readonly ToolSubmissionPage[] | undefined): ToolSubmission[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: ToolSubmission[] = [];
  for (const page of pages) {
    for (const row of page.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

type Who = Pick<ToolSubmission, 'name' | 'business' | 'email'>;

const filled = (value: string | null | undefined): string | null => (value?.trim() ? value.trim() : null);

/** Who asked: the name, else the business, else the email. */
export function displayName(row: Who): string {
  return filled(row.name) ?? filled(row.business) ?? row.email;
}

/** The business when it is not already the title (null when there is none to show). */
export function businessLine(row: Who): string | null {
  const business = filled(row.business);
  return business && business !== displayName(row) ? business : null;
}

/** The email when it is not already the title. */
export function emailLine(row: Who): string | null {
  return row.email !== displayName(row) ? row.email : null;
}

/* ---------- cells ---------- */

/** A row value; `faint` when it says something is missing rather than a figure. */
export type Cell = { text: string; faint: boolean };

/** What a skipped question shows (the same word the tool's own answers use). */
export const SKIPPED = 'Skipped';
/** The leak when the tool could not work it out: never a made-up $0. */
export const NOT_WORKED_OUT = 'Not worked out';

/** "20% → 35%", or null when the close rate was skipped. */
export function closeRateText(rate: CloseRate | null): string | null {
  if (!rate || !Number.isFinite(rate.before) || !Number.isFinite(rate.after)) return null;
  return `${formatPercent(rate.before)} → ${formatPercent(rate.after)}`;
}

/** The same for TalkBack: "20% to 35%". */
function closeRateSpoken(rate: CloseRate | null): string | null {
  if (!rate || !Number.isFinite(rate.before) || !Number.isFinite(rate.after)) return null;
  return `${formatPercent(rate.before)} to ${formatPercent(rate.after)}`;
}

/** The monthly leak with its cents ($4,375 or $387.50). */
export function leakCell(row: Pick<ToolSubmission, 'leak'>): Cell {
  const text = formatMoney(row.leak);
  return text ? { text, faint: false } : { text: NOT_WORKED_OUT, faint: true };
}

export function closeRateCell(row: Pick<ToolSubmission, 'closeRate'>): Cell {
  const text = closeRateText(row.closeRate);
  return text ? { text, faint: false } : { text: SKIPPED, faint: true };
}

export function replySpeedCell(row: Pick<ToolSubmission, 'replySpeed'>): Cell {
  const text = filled(row.replySpeed);
  return text ? { text, faint: false } : { text: SKIPPED, faint: true };
}

/* ---------- badges ---------- */

export type BadgeSpec = { label: string; tone: Tone };

/** Newsletter: "Opted in" (ok) or "No" (muted). */
export function newsletterBadge(newsletter: boolean): BadgeSpec {
  return newsletter ? { label: 'Opted in', tone: 'ok' } : { label: 'No', tone: 'muted' };
}

/**
 * Delivered: the breakdown email ("Email", or "No email" in warn: the person
 * never got what they asked for) and the CRM ("CRM", or "No CRM", muted:
 * older submissions predate the CRM sync).
 */
export function deliveredBadges(delivered: ToolSubmission['delivered']): [BadgeSpec, BadgeSpec] {
  return [
    delivered.email ? { label: 'Email', tone: 'ok' } : { label: 'No email', tone: 'warn' },
    delivered.crm ? { label: 'CRM', tone: 'ok' } : { label: 'No CRM', tone: 'muted' },
  ];
}

/* ---------- TalkBack ---------- */

/** One sentence for the whole row card, in the order it reads on screen. */
export function rowSpokenLabel(row: ToolSubmission, now: Date = new Date()): string {
  const leak = formatMoney(row.leak);
  const close = closeRateSpoken(row.closeRate);
  const reply = filled(row.replySpeed);
  const [email, crm] = deliveredBadges(row.delivered);
  return [
    row.toolName,
    displayName(row),
    businessLine(row),
    emailLine(row),
    leak ? `Leak ${leak} per month` : `Leak ${NOT_WORKED_OUT.toLowerCase()}`,
    close ? `Close rate ${close}` : 'Close rate skipped',
    reply ? `Reply speed ${reply}` : 'Reply speed skipped',
    `Newsletter ${newsletterBadge(row.newsletter).label.toLowerCase()}`,
    `Delivered: ${email.label}, ${crm.label}`,
    relativeTime(row.createdAt, now),
  ]
    .filter(Boolean)
    .join('. ');
}

/* ---------- breakdown ---------- */

/**
 * A breakdown value that reads as a figure ("$4,375", "40%", "12.5",
 * "US$1,200.50") rather than a sentence ("Not worked out: the close rate was
 * skipped"). Figures get tabular numerals; sentences wrap as text.
 */
export function isFigure(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 18 && /\d/.test(v) && /^[-+]?[A-Z]{0,3}[$€£]?\s?[-+]?[\d,.\s]*\d%?$/.test(v);
}

/* ---------- KPI card sizing ---------- */

/** Geist Mono 500 at 11sp with 18% tracking: about 8.6dp per character (the eyebrow). */
const EYEBROW_CHAR_DP = 8.6;
/** Card padding (2 x 16) and borders (2 x 1). */
const CARD_CHROME = 16 * 2 + 2;
/** The `number` variant (StatCard size md): Geist 800 at 28sp, -4% tracking. */
const NUMBER_SP = 28;
const TRACKING_EM = -0.04;
/** Room so a measured-to-the-pixel number never ellipsizes on a rounding difference. */
const SAFETY_DP = 6;

/** Advance widths of Geist 800 in em (tabular digits take the widest digit, 0.70). */
function advanceEm(ch: string): number {
  if (ch >= '0' && ch <= '9') return 0.71;
  if (ch === ',' || ch === '.') return 0.25;
  if (ch === ' ' || ch === ' ' || ch === ' ') return 0.23;
  if (ch === '$') return 0.69;
  if (ch === '%') return 0.84;
  return 0.8;
}

/** Width in dp of a number at `fontSize` sp and font scale 1. */
export function figureWidth(text: string, fontSize: number = NUMBER_SP): number {
  let em = 0;
  for (const ch of text) em += advanceEm(ch) + TRACKING_EM;
  return em * fontSize;
}

/** The font scale the app honours (Text caps it at 1.3). */
const scaleOf = (fontScale: number) => Math.min(Math.max(fontScale, 0.85), 1.3);

/**
 * Width of a KPI card in a sideways row: wide enough for its eyebrow and its
 * number in full at this font scale (money is never cut or rounded), and at
 * least `min`. `samples` are numbers to reserve room for (e.g. while loading).
 */
export function statCardWidth(label: string, values: readonly string[], fontScale: number, min: number): number {
  const scale = scaleOf(fontScale);
  const labelWidth = label.length * EYEBROW_CHAR_DP * scale + CARD_CHROME;
  const numberWidth = Math.max(0, ...values.map((v) => figureWidth(v) * scale)) + CARD_CHROME + SAFETY_DP;
  return Math.ceil(Math.max(min, labelWidth, numberWidth));
}

/** Screen gutters (2 x 16) and the gap between two cards (12). */
const PAIR_CHROME = 16 * 2 + 12;

/**
 * Two cards side by side, or one column when the longest label would not fit
 * a half-width card at this font scale (the label is never cut off).
 */
export function pairColumns(windowWidth: number, fontScale: number, labels: readonly string[]): 1 | 2 {
  const inner = (windowWidth - PAIR_CHROME) / 2 - CARD_CHROME;
  const longest = Math.max(0, ...labels.map((l) => l.length));
  return inner >= longest * EYEBROW_CHAR_DP * scaleOf(fontScale) ? 2 : 1;
}

/* ---------- route ---------- */

/** A route param that may arrive as a list: its first value, or "" when missing. */
export function firstParam(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() ? v.trim() : '';
}
