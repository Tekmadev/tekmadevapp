import type { ToolSubmission, ToolSubmissionPage } from '@/api/schemas/tools';

import {
  businessLine,
  closeRateCell,
  closeRateText,
  deliveredBadges,
  displayName,
  emailLine,
  figureWidth,
  firstParam,
  isFigure,
  leakCell,
  newsletterBadge,
  pairColumns,
  replySpeedCell,
  rowSpokenLabel,
  rowsOf,
  statCardWidth,
} from '../logic';

// Noon in Toronto on Oct 2, 2026.
const NOW = new Date('2026-10-02T16:00:00Z');

function sub(overrides: Partial<ToolSubmission> = {}): ToolSubmission {
  return {
    id: 'ts_1',
    tool: 'missed-call-leak',
    toolName: 'Missed-call leak calculator',
    name: 'Chloe Roy',
    email: 'chloe@roykb.test',
    business: 'Roy Kitchen & Bath',
    leak: { amount: 437_500, currency: 'CAD' },
    closeRate: { before: 0.25, after: 0.4 },
    replySpeed: 'Same day',
    newsletter: true,
    delivered: { email: true, crm: false },
    createdAt: '2026-10-02T13:00:00.000000Z',
    ...overrides,
  };
}

const page = (items: ToolSubmission[], nextCursor: string | null = null): ToolSubmissionPage => ({ items, nextCursor });

describe('rowsOf', () => {
  it('keeps page order and drops a row repeated on a later page', () => {
    const a = sub({ id: 'a' });
    const b = sub({ id: 'b' });
    const c = sub({ id: 'c' });
    expect(rowsOf([page([a, b], 'x'), page([b, c])]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('is empty before anything loads', () => {
    expect(rowsOf(undefined)).toEqual([]);
  });
});

describe('who asked', () => {
  it('uses the name, with business and email under it', () => {
    const row = sub();
    expect([displayName(row), businessLine(row), emailLine(row)]).toEqual(['Chloe Roy', 'Roy Kitchen & Bath', 'chloe@roykb.test']);
  });
  it('falls back to the business, then the email, without repeating it', () => {
    const noName = sub({ name: null });
    expect([displayName(noName), businessLine(noName), emailLine(noName)]).toEqual(['Roy Kitchen & Bath', null, 'chloe@roykb.test']);
    const onlyEmail = sub({ name: '  ', business: null });
    expect([displayName(onlyEmail), businessLine(onlyEmail), emailLine(onlyEmail)]).toEqual(['chloe@roykb.test', null, null]);
  });
});

describe('cells', () => {
  it('shows the leak with its cents and never a made-up $0', () => {
    expect(leakCell(sub({ leak: { amount: 87_525, currency: 'CAD' } }))).toEqual({ text: '$875.25', faint: false });
    expect(leakCell(sub())).toEqual({ text: '$4,375', faint: false });
    expect(leakCell(sub({ leak: null }))).toEqual({ text: 'Not worked out', faint: true });
  });
  it('writes the close rate as "20% → 35%"', () => {
    expect(closeRateText({ before: 0.2, after: 0.35 })).toBe('20% → 35%');
    expect(closeRateCell(sub({ closeRate: null }))).toEqual({ text: 'Skipped', faint: true });
  });
  it('says Skipped for a skipped reply speed', () => {
    expect(replySpeedCell(sub())).toEqual({ text: 'Same day', faint: false });
    expect(replySpeedCell(sub({ replySpeed: null }))).toEqual({ text: 'Skipped', faint: true });
  });
});

describe('badges', () => {
  it('uses the brief words', () => {
    expect(newsletterBadge(true).label).toBe('Opted in');
    expect(newsletterBadge(false).label).toBe('No');
    expect(deliveredBadges({ email: true, crm: true }).map((b) => b.label)).toEqual(['Email', 'CRM']);
    expect(deliveredBadges({ email: false, crm: false }).map((b) => b.label)).toEqual(['No email', 'No CRM']);
  });
  it('flags a bounced breakdown email', () => {
    expect(deliveredBadges({ email: false, crm: true })[0].tone).toBe('warn');
  });
});

describe('rowSpokenLabel', () => {
  it('reads the row in screen order', () => {
    expect(rowSpokenLabel(sub(), NOW)).toBe(
      'Missed-call leak calculator. Chloe Roy. Roy Kitchen & Bath. chloe@roykb.test. Leak $4,375 per month. ' +
        'Close rate 25% to 40%. Reply speed Same day. Newsletter opted in. Delivered: Email, No CRM. 3 h ago',
    );
  });
  it('says what is missing instead of inventing it', () => {
    const label = rowSpokenLabel(sub({ leak: null, closeRate: null, replySpeed: null, name: null, business: null }), NOW);
    expect(label).toContain('Leak not worked out');
    expect(label).toContain('Close rate skipped');
    expect(label).toContain('Reply speed skipped');
    expect(label.match(/chloe@roykb\.test/g)).toHaveLength(1);
  });
});

describe('isFigure', () => {
  it.each(['$4,375', '$387.50', '40%', '12.5', '50', 'US$1,200.50', '-$40'])('%s is a figure', (v) => {
    expect(isFigure(v)).toBe(true);
  });
  it.each(['Not worked out: the close rate was skipped', 'Same day', 'Not given', '', 'Within 5 minutes'])('"%s" is text', (v) => {
    expect(isFigure(v)).toBe(false);
  });
});

describe('statCardWidth', () => {
  it('never goes under the minimum', () => {
    expect(statCardWidth('Submissions', ['36'], 1, 172)).toBe(172);
  });
  it('fits a long label at large font sizes', () => {
    const normal = statCardWidth('Newsletter opt-ins', ['21'], 1, 172);
    const large = statCardWidth('Newsletter opt-ins', ['21'], 1.3, 172);
    expect(normal).toBeGreaterThan(172);
    expect(large).toBeGreaterThan(normal);
    // The font scale is capped at 1.3, like Text.
    expect(statCardWidth('Newsletter opt-ins', ['21'], 2, 172)).toBe(large);
  });
  it('fits the whole amount, cents included', () => {
    const amount = '$1,214,387.50';
    expect(statCardWidth('Leak reported', [amount], 1, 172)).toBeGreaterThanOrEqual(Math.ceil(figureWidth(amount) + 34));
    expect(figureWidth('$1,214,387.50')).toBeGreaterThan(figureWidth('$4,375'));
  });
});

describe('pairColumns', () => {
  it('sits side by side on a normal phone and stacks when the label would be cut', () => {
    expect(pairColumns(412, 1, ['Leak per month', 'Close rate'])).toBe(2);
    expect(pairColumns(360, 1.3, ['Leak per month', 'Close rate'])).toBe(1);
  });
});

describe('firstParam', () => {
  it('takes the first value and trims', () => {
    expect(firstParam('ts_1')).toBe('ts_1');
    expect(firstParam(['ts_2', 'ts_3'])).toBe('ts_2');
    expect(firstParam(undefined)).toBe('');
    expect(firstParam(' ')).toBe('');
  });
});
