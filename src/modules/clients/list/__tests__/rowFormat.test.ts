import { attentionBadges, goLiveCell, guaranteeCell, stageCell, tasksCell } from '../rowFormat';
import { toClientsView } from '../views';

// Noon in Toronto on Oct 2, 2026.
const NOW = new Date('2026-10-02T16:00:00Z');

describe('goLiveCell', () => {
  it('shows the live date once live', () => {
    expect(goLiveCell({ liveDate: '2026-09-12', targetDate: null }, NOW).text).toBe('live Sep 12');
  });
  it('counts down to the target, and says late in signal after it', () => {
    expect(goLiveCell({ liveDate: null, targetDate: '2026-10-10' }, NOW)).toMatchObject({ text: '8d to live' });
    expect(goLiveCell({ liveDate: null, targetDate: '2026-09-29' }, NOW)).toMatchObject({ text: '3d late', tone: 'signal' });
    expect(goLiveCell({ liveDate: null, targetDate: '2026-10-02' }, NOW).text).toBe('live today');
  });
  it('is quiet without a target', () => {
    expect(goLiveCell({ liveDate: null, targetDate: null }, NOW)).toMatchObject({ text: 'No target', tone: 'faint' });
  });
});

describe('tasksCell', () => {
  it('splits client and our tasks', () => {
    expect(tasksCell({ stage: 'build', openTasks: { client: 2, us: 5 } }).text).toBe('2 client · 5 us');
  });
  it('says None without a run', () => {
    expect(tasksCell({ stage: null, openTasks: { client: 0, us: 0 } }).text).toBe('None');
  });
});

describe('guaranteeCell', () => {
  const base = { eligible: true, counted: 12, target: 30, daysIn: 19, daysLeft: 41, windowDays: 60 };
  it('shows counted/target and days left with the pace badge', () => {
    const cell = guaranteeCell({ ...base, status: 'on_pace' });
    expect(cell.text).toBe('12/30 · 41d');
    expect(cell.badge).toEqual({ label: 'On pace', tone: 'ok' });
    expect(guaranteeCell({ ...base, status: 'behind' }).badge).toEqual({ label: 'Behind', tone: 'warn' });
  });
  it('says Not started or n/a', () => {
    expect(guaranteeCell({ ...base, status: 'not_started' }).text).toBe('Not started');
    expect(guaranteeCell({ ...base, eligible: false, status: 'n/a' }).text).toBe('n/a');
  });
});

describe('stageCell and attentionBadges', () => {
  it('uses the stage label, or No onboarding', () => {
    expect(stageCell(undefined, { stage: 'go_live', blocked: true })).toMatchObject({ text: 'Go live', spoken: 'stage Go live, blocked' });
    expect(stageCell(undefined, { stage: null, blocked: false }).text).toBe('No onboarding');
  });
  it('lists only what needs review, and tolerates missing fields', () => {
    expect(attentionBadges({ callsToReview: 3, intakeToReview: true })).toEqual(['3 calls to review', 'Intake to review']);
    expect(attentionBadges({ callsToReview: 1, intakeToReview: false })).toEqual(['1 call to review']);
    expect(attentionBadges({})).toEqual([]);
  });
});

describe('toClientsView', () => {
  it('accepts the Home views and ignores anything else', () => {
    expect(toClientsView('blocked')).toBe('blocked');
    expect(toClientsView('booked')).toBeNull();
    expect(toClientsView(undefined)).toBeNull();
  });
});
