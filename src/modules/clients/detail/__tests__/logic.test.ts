import type { Billing, Guarantee, IntakeField, OnboardingTask } from '@/api/schemas/clients';

import { formatIntakeAnswer, intakeAnswerGroups } from '../intake/logic';
import {
  activeSectionIndex,
  anchorDelta,
  billingStat,
  bottomFill,
  callsStat,
  goLiveToast,
  initialSection,
  jumpOffset,
  UNMEASURED,
  visibleSections,
} from '../logic';
import { groupTasks, optimisticTask, statusToast, taskMetaParts } from '../onboarding/logic';

const NOW = new Date('2026-10-02T16:00:00Z');

const guarantee = (patch: Partial<Guarantee> = {}): Guarantee => ({
  eligible: true,
  counted: 12,
  target: 30,
  windowDays: 60,
  countRule: 'booked',
  clockStarted: true,
  clockStartedOn: '2026-09-01',
  endsOn: '2026-10-30',
  daysIn: 31,
  daysLeft: 29,
  expectedByNow: 15,
  status: 'behind',
  needsReview: 0,
  ...patch,
});

const task = (patch: Partial<OnboardingTask> = {}): OnboardingTask => ({
  id: 't1',
  runId: 'r1',
  templateKey: null,
  title: 'Share Google Business access',
  description: null,
  stage: 'intake',
  owner: 'client',
  kind: 'access',
  required: true,
  status: 'todo',
  dueAt: null,
  doneAt: null,
  doneBy: null,
  sortOrder: 1,
  createdAt: '2026-09-01T13:00:00Z',
  updatedAt: '2026-09-01T13:00:00Z',
  ...patch,
});

describe('sections', () => {
  it('never lists CRM for managers', () => {
    expect(visibleSections(false)).not.toContain('crm');
    expect(visibleSections(true)).toContain('crm');
  });

  it('opens at the route section, or the one an action belongs to', () => {
    expect(initialSection('intake', undefined, visibleSections(true))).toBe('intake');
    expect(initialSection('crm', undefined, visibleSections(false))).toBeNull();
    expect(initialSection(undefined, 'log-call', visibleSections(false))).toBe('calls');
    expect(initialSection('nope', undefined, visibleSections(true))).toBeNull();
  });
});

describe('stat cards', () => {
  it('shows the subscription as Ending while it cancels, with the money exact', () => {
    const billing: Billing = {
      subscription: {
        id: 's1',
        kind: 'plan',
        productName: 'Grow',
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-10-20T04:00:00Z',
        amount: { amount: 77750, currency: 'cad' },
        interval: 'month',
      },
      latestOrder: null,
      carePlan: { required: false, active: false },
    };
    expect(billingStat(billing, {}, NOW)).toEqual({ label: 'Billing', value: 'Ending', sub: '$777.50/mo · ends Oct 20' });
  });

  it('falls back to the latest order, then to no billing record', () => {
    const billing: Billing = {
      subscription: null,
      latestOrder: { id: 'o1', productName: 'Webline', status: 'paid', amount: { amount: 150000, currency: 'cad' }, paymentMethod: 'Visa •••• 4242', paidAt: null, createdAt: '2026-09-01T13:00:00Z' },
      carePlan: { required: true, active: false },
    };
    expect(billingStat(billing, {}, NOW).sub).toBe('$1,500 one-time · Visa •••• 4242');
    expect(billingStat(null, {}, NOW)).toEqual({ label: 'Billing', value: 'None', sub: 'no billing record' });
  });

  it('says "no guarantee" for clients without one', () => {
    expect(callsStat(guarantee()).sub).toBe('target 30');
    expect(callsStat(guarantee({ eligible: false })).sub).toBe('no guarantee');
  });

  it('adds the guarantee sentence only when the clock started for an eligible client', () => {
    expect(goLiveToast(guarantee())).toBe('Live. Guarantee clock started.');
    expect(goLiveToast(guarantee({ eligible: false, clockStarted: false }))).toBe('Live.');
  });
});

describe('scroll math', () => {
  it('picks the last section above the line, the first until layout arrives', () => {
    expect(activeSectionIndex([UNMEASURED, UNMEASURED], 500)).toBe(0);
    expect(activeSectionIndex([400, 900, 1600], 1000)).toBe(1);
    expect(activeSectionIndex([400, 900, 1600], 100)).toBe(0);
  });

  it('lands sections under the tabs and never scrolls above the top', () => {
    expect(jumpOffset(900, 49)).toBe(851);
    expect(jumpOffset(20, 49)).toBe(0);
    expect(bottomFill(700, 49, 300, 40)).toBe(311);
    expect(bottomFill(700, 49, 900, 40)).toBe(0);
  });

  it('keeps the reader still only when the change is above them', () => {
    expect(anchorDelta({ top: 0, height: 300 }, 360, 800, 49)).toBe(60);
    expect(anchorDelta({ top: 700, height: 300 }, 360, 800, 49)).toBe(0);
  });
});

describe('onboarding tasks', () => {
  it('closes a task with the time and who, and reopens it clean', () => {
    const done = optimisticTask(task(), 'done', 'Shajeed I.', '2026-10-02T16:00:00.000Z');
    expect(done).toMatchObject({ status: 'done', doneAt: '2026-10-02T16:00:00.000Z', doneBy: 'Shajeed I.' });
    expect(optimisticTask(done, 'todo', 'Sam', '2026-10-02T17:00:00.000Z')).toMatchObject({ status: 'todo', doneAt: null, doneBy: null });
  });

  it('writes the line under a task', () => {
    const labels = { owner: 'Client', kind: 'Access' };
    const late = taskMetaParts(task({ required: false, dueAt: '2026-09-29T21:00:00Z' }), labels, NOW).map((p) => p.text);
    expect(late).toEqual(['optional', 'Client', 'Access', 'due Sep 29', '3d late']);
    const closed = taskMetaParts(task({ status: 'done', doneAt: '2026-09-30T15:00:00Z', doneBy: 'Sam' }), labels, NOW).map((p) => p.text);
    expect(closed).toEqual(['Client', 'Access', 'done Sep 30 by Sam']);
  });

  it('groups by stage in tracker order and counts closed tasks', () => {
    const groups = groupTasks([task({ id: 'b', stage: 'build' }), task({ id: 'w', stage: 'welcome', status: 'skipped' })]);
    expect(groups.map((g) => [g.stage, g.closed])).toEqual([
      ['welcome', 1],
      ['build', 0],
    ]);
  });

  it('words the toast', () => {
    expect(statusToast('Waiting on client')).toBe('Marked waiting on client.');
  });
});

describe('intake answers', () => {
  const select: IntakeField = { key: 'size', label: 'Team size', type: 'select', help: null, options: [{ value: '1_5', label: '1 to 5' }] };
  const multi: IntakeField = { ...select, key: 'src', type: 'multiselect', options: [{ value: 'google', label: 'Google search' }, { value: 'referrals', label: 'Referrals' }] };

  it('shows option labels, never raw values, and null when unanswered', () => {
    expect(formatIntakeAnswer(select, '1_5')).toBe('1 to 5');
    expect(formatIntakeAnswer(multi, ['referrals', 'google'])).toBe('Referrals, Google search');
    expect(formatIntakeAnswer(multi, [])).toBeNull();
    expect(formatIntakeAnswer(select, '  ')).toBeNull();
    expect(formatIntakeAnswer(select, undefined)).toBeNull();
    expect(formatIntakeAnswer({ ...select, type: 'number' }, 1200)).toBe('1,200');
  });

  it('follows the schema and counts what was answered', () => {
    const groups = intakeAnswerGroups([{ key: 'business', title: 'Your business', fields: [select, multi] }], { size: '1_5' });
    expect(groups[0]).toMatchObject({ title: 'Your business', answered: 1 });
    expect(groups[0]?.rows.map((r) => r.value)).toEqual(['1 to 5', null]);
  });
});
