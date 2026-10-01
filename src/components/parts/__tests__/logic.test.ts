import { formatCents } from '@/lib/money';
import { formatCount } from '@/lib/format';

import {
  badgeCountLabel,
  buildCountFrames,
  chipLabel,
  clamp,
  contactUrl,
  longestFrame,
  offlineCopy,
  percentLabel,
  PULL_MAX,
  PULL_TRIGGER,
  pullDistance,
  stageStates,
  tabAccessibilityLabel,
  toFraction,
} from '../logic';

describe('badges and labels', () => {
  it('caps the inbox badge at 99+ and hides it at zero', () => {
    expect(badgeCountLabel(0)).toBe('');
    expect(badgeCountLabel(-3)).toBe('');
    expect(badgeCountLabel(Number.NaN)).toBe('');
    expect(badgeCountLabel(4)).toBe('4');
    expect(badgeCountLabel(99)).toBe('99');
    expect(badgeCountLabel(100)).toBe('99+');
    expect(badgeCountLabel(2500)).toBe('99+');
  });

  it('reads the tab with its unread count', () => {
    expect(tabAccessibilityLabel('Inbox', 4)).toBe('Inbox, 4 unread');
    expect(tabAccessibilityLabel('Inbox', 120)).toBe('Inbox, 99+ unread');
    expect(tabAccessibilityLabel('Home')).toBe('Home');
    expect(tabAccessibilityLabel('Inbox', 0)).toBe('Inbox');
  });

  it('adds an optional count to chip labels', () => {
    expect(chipLabel('Needs action', 3)).toBe('Needs action (3)');
    expect(chipLabel('Needs action', 0)).toBe('Needs action (0)');
    expect(chipLabel('All')).toBe('All');
    expect(chipLabel('All', null)).toBe('All');
    expect(chipLabel('All', Number.NaN)).toBe('All');
  });
});

describe('pull to refresh resistance', () => {
  it('does nothing for upward or no drag', () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
  });

  it('follows the finger at first, then stiffens', () => {
    expect(pullDistance(10)).toBeGreaterThan(7);
    expect(pullDistance(10)).toBeLessThan(10);
    // Each extra 50dp of finger travel buys less content travel.
    const a = pullDistance(50) - pullDistance(0);
    const b = pullDistance(150) - pullDistance(100);
    expect(b).toBeLessThan(a);
  });

  it('reaches the trigger at about 130dp of finger travel and never passes the max', () => {
    expect(pullDistance(120)).toBeLessThan(PULL_TRIGGER);
    expect(pullDistance(140)).toBeGreaterThan(PULL_TRIGGER);
    expect(pullDistance(5000)).toBeLessThanOrEqual(PULL_MAX);
  });
});

describe('count-up frames', () => {
  it('starts at the previous value and lands exactly on the new one', () => {
    const frames = buildCountFrames(1200, 1350, formatCount, 600);
    expect(frames[0]).toBe('1,200');
    expect(frames[frames.length - 1]).toBe('1,350');
    expect(frames.length).toBe(36);
  });

  it('moves fast first and lands gently', () => {
    const values = buildCountFrames(0, 1000, String, 600).map(Number);
    const first = values[5] - values[0];
    const last = values[values.length - 1] - values[values.length - 6];
    expect(first).toBeGreaterThan(last);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  });

  it('counts down too', () => {
    const frames = buildCountFrames(50, 10, String, 600);
    expect(frames[0]).toBe('50');
    expect(frames[frames.length - 1]).toBe('10');
  });

  it('formats money frames in whole cents, keeping the exact final amount', () => {
    const frames = buildCountFrames(7000, 7750, (c) => formatCents(c), 600);
    expect(frames[frames.length - 1]).toBe('$77.50');
    expect(frames.every((f) => f.startsWith('$'))).toBe(true);
  });

  it('keeps fractions when asked', () => {
    const frames = buildCountFrames(0, 1, (v) => v.toFixed(2), 600, false);
    expect(frames.some((f) => f !== '0.00' && f !== '1.00')).toBe(true);
  });

  it('bounds the frame count for very short or long durations', () => {
    expect(buildCountFrames(0, 10, String, 0).length).toBe(2);
    expect(buildCountFrames(0, 10, String, 60_000).length).toBe(120);
  });

  it('finds the widest frame', () => {
    expect(longestFrame(['$9.99', '$10.01', '$12'])).toBe('$10.01');
    expect(longestFrame([])).toBe('');
  });
});

describe('offline copy', () => {
  const now = new Date('2026-09-30T20:00:00Z'); // 4:00 PM in Toronto

  it('uses the brief wording with a Toronto time', () => {
    expect(offlineCopy('2026-09-30T18:41:00Z', now)).toBe('Offline · showing what was loaded at 2:41 PM');
    expect(offlineCopy(Date.parse('2026-09-30T18:41:00Z'), now)).toBe('Offline · showing what was loaded at 2:41 PM');
  });

  it('adds the date when the data is from another day', () => {
    expect(offlineCopy('2026-09-28T13:05:00Z', now)).toBe('Offline · showing what was loaded at Sep 28, 9:05 AM');
  });

  it('never prints a bogus time', () => {
    expect(offlineCopy(null, now)).toBe('Offline · showing what was loaded earlier');
    expect(offlineCopy(0, now)).toBe('Offline · showing what was loaded earlier');
    expect(offlineCopy('not a date', now)).toBe('Offline · showing what was loaded earlier');
  });
});

describe('stages', () => {
  const values = ['intake', 'build', 'review', 'launch'];

  it('marks stages before the current one done', () => {
    expect(stageStates(values, 'review')).toEqual(['done', 'done', 'current', 'todo']);
    expect(stageStates(values, 'intake')).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(stageStates(values, 'launch')).toEqual(['done', 'done', 'done', 'current']);
  });

  it('marks nothing done for an unknown or missing stage', () => {
    expect(stageStates(values, 'paused')).toEqual(['todo', 'todo', 'todo', 'todo']);
    expect(stageStates(values, null)).toEqual(['todo', 'todo', 'todo', 'todo']);
  });
});

describe('misc', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it('turns broken progress into 0, never a guess', () => {
    expect(toFraction(null)).toBe(0);
    expect(toFraction(undefined)).toBe(0);
    expect(toFraction(Number.NaN)).toBe(0);
    expect(toFraction(1.4)).toBe(1);
    expect(toFraction(0.41)).toBe(0.41);
  });

  it('labels percents', () => {
    expect(percentLabel(41.4)).toBe('41%');
    expect(percentLabel(140)).toBe('100%');
    expect(percentLabel(Number.NaN)).toBe('0%');
  });

  it('builds call and email links only for real values', () => {
    expect(contactUrl('phone', '(905) 555-0142')).toBe('tel:9055550142');
    expect(contactUrl('phone', '+1 905 555 0142')).toBe('tel:+19055550142');
    expect(contactUrl('phone', 'ext')).toBeNull();
    expect(contactUrl('email', 'maya@acme.ca')).toBe('mailto:maya@acme.ca');
    expect(contactUrl('email', 'maya at acme')).toBeNull();
    expect(contactUrl('email', '  ')).toBeNull();
  });
});
