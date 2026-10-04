import type { ClientCredit } from '@/api/schemas/clients';

import {
  CREDIT_COPY,
  creditLine,
  creditProblems,
  creditRoleOptions,
  creditsInput,
  draftFromCredits,
  hasProblems,
  newDraftRow,
  parseShare,
  sameAsSaved,
  sanitizeShareInput,
  shareHundredths,
  totalHundredths,
  totalIsValid,
  totalText,
  type CreditDraftRow,
} from '../credits/logic';

const NOAH = 'staff@tekmadev.test';
const MAYA = 'manager@tekmadev.test';

let n = 0;
const draft = (email: string | null, role: CreditDraftRow['role'], share: string): CreditDraftRow => ({ key: `k${++n}`, email, role, share });

describe('shares', () => {
  it('reads what was typed, with or without a percent sign', () => {
    expect(parseShare('50')).toBe(50);
    expect(parseShare(' 33.33 ')).toBe(33.33);
    expect(parseShare('12,5')).toBe(12.5);
    expect(parseShare('40%')).toBe(40);
    expect(parseShare('.5')).toBe(0.5);
    expect(parseShare('')).toBeNull();
    expect(parseShare('abc')).toBeNull();
    expect(parseShare('1e2')).toBeNull();
  });

  it('accepts 0.01 to 100 with two decimals at most, like the server', () => {
    expect(shareHundredths(100)).toBe(10_000);
    expect(shareHundredths(0.01)).toBe(1);
    expect(shareHundredths(33.33)).toBe(3333);
    expect(shareHundredths(0)).toBeNull();
    expect(shareHundredths(100.01)).toBeNull();
    expect(shareHundredths(33.333)).toBeNull();
    expect(shareHundredths(null)).toBeNull();
  });

  it('keeps the share box to digits and two decimals while typing', () => {
    expect(sanitizeShareInput('33.333')).toBe('33.33');
    expect(sanitizeShareInput('5a0')).toBe('50');
    expect(sanitizeShareInput('1000')).toBe('100');
    expect(sanitizeShareInput('12,5')).toBe('12.5');
    expect(sanitizeShareInput('1.2.3')).toBe('1.23');
  });
});

describe('the 100 percent rule', () => {
  it('adds the shares in hundredths, so 33.33 + 33.33 + 33.34 is exactly 100', () => {
    const rows = [draft(NOAH, 'finder', '33.33'), draft(MAYA, 'booker', '33.33'), draft(NOAH, 'other', '33.34')];
    expect(totalHundredths(rows)).toBe(10_000);
    expect(totalIsValid(rows)).toBe(true);
    expect(totalText(totalHundredths(rows))).toBe('100%');
  });

  it('refuses a total other than 100, and allows no rows at all (nobody gets credit)', () => {
    expect(totalIsValid([draft(NOAH, 'finder', '50'), draft(MAYA, 'booker', '40')])).toBe(false);
    expect(totalText(9000)).toBe('90%');
    expect(totalIsValid([])).toBe(true);
    expect(hasProblems(creditProblems([], 'Nobody earned it.'))).toBe(false);
  });

  it('reports the server copy for each mistake', () => {
    const missing = draft(null, 'finder', '');
    const problems = creditProblems([missing, draft(MAYA, 'booker', '100')], '');
    expect(problems.rows[missing.key]).toEqual({ person: CREDIT_COPY.pickPerson, share: CREDIT_COPY.shareRange });
    expect(problems.note).toBe('Add a note saying why.');

    expect(creditProblems([draft(NOAH, 'finder', '60'), draft(MAYA, 'booker', '30')], 'x').list).toBe('Shares must add up to 100.');
    expect(creditProblems([draft(NOAH, 'finder', '50'), draft(NOAH, 'finder', '50')], 'x').list).toBe('List each person once per role.');
    // One person may hold several roles.
    expect(hasProblems(creditProblems([draft(NOAH, 'finder', '50'), draft(NOAH, 'booker', '50')], 'Both.'))).toBe(false);
    expect(creditProblems([draft(NOAH, 'finder', '100')], 'x'.repeat(501)).note).toBe('Keep the note to 500 characters or fewer.');
    const many = Array.from({ length: 21 }, (_, i) => draft(`p${i}@tekmadev.test`, 'other', '1'));
    expect(creditProblems(many, 'x').list).toBe('Keep it to 20 credits or fewer.');
  });
});

describe('the editor draft', () => {
  const saved: ClientCredit[] = [
    { email: NOAH, name: 'Noah Lavoie', role: 'finder', share: 50 },
    { email: MAYA, name: 'Maya Chen', role: 'booker', share: 50 },
  ];

  it('starts from the saved rows and knows when nothing changed', () => {
    const rows = draftFromCredits(saved);
    expect(rows.map((r) => [r.email, r.role, r.share])).toEqual([
      [NOAH, 'finder', '50'],
      [MAYA, 'booker', '50'],
    ]);
    expect(sameAsSaved([...rows].reverse(), saved)).toBe(true);
    expect(sameAsSaved([{ ...rows[0], share: '60' }, { ...rows[1], share: '40' }], saved)).toBe(false);
  });

  it('adds the first role nobody holds yet', () => {
    const rows = draftFromCredits(saved);
    expect(newDraftRow(rows).role).toBe('other');
    expect(newDraftRow([]).role).toBe('finder');
    expect(newDraftRow([draft(NOAH, 'finder', '50')]).role).toBe('booker');
  });

  it('sends lowercased emails, numeric shares and a trimmed note', () => {
    expect(creditsInput([draft('Staff@Tekmadev.test', 'finder', '33.33'), draft(MAYA, 'booker', '66.67')], '  Split it.  ')).toEqual({
      credits: [
        { email: NOAH, role: 'finder', share: 33.33 },
        { email: MAYA, role: 'booker', share: 66.67 },
      ],
      note: 'Split it.',
    });
  });

  it('labels roles from meta, with the server words as a fallback', () => {
    expect(creditRoleOptions(undefined).map((o) => o.label)).toEqual(['Finder', 'Booker', 'Other']);
    expect(creditLine(undefined, { role: 'booker', share: 50 })).toBe('Booker · 50%');
    expect(creditLine({ creditRoles: [{ value: 'booker', label: 'Closer', help: '' }] }, { role: 'booker', share: 12.5 })).toBe('Closer · 12.5%');
  });
});
