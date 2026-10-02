import { ApiError } from '@/api/errors';
import type { CrmAttentionItem, CrmInspectSide } from '@/api/schemas/crm';

import {
  compareRows,
  consentLine,
  discardDoneMessage,
  discardQuestion,
  DISCARD_ONE,
  groupByQueue,
  healthBadge,
  jobFailureMessage,
  lastCheckedLine,
  mergeTag,
  reconcileLine,
  retryDoneMessage,
  switchBadge,
  switchToast,
  switchWarning,
  syncDoneMessage,
} from '../logic';

const NOW = new Date('2026-10-02T16:00:00Z'); // 12:00 PM Toronto

const item = (id: string, queue: 'outbox' | 'inbox', signed = true): CrmAttentionItem => ({
  id,
  queue,
  what: 'Push contact',
  direction: queue === 'outbox' ? 'to_crm' : 'from_crm',
  who: 'a@b.test',
  tries: 2,
  why: 'Because.',
  at: '2026-10-02T12:00:00Z',
  signed,
});

describe('switches', () => {
  it('badges Off, Running and On, not running', () => {
    expect(switchBadge({ on: false, running: false, lastRunAt: null })).toEqual({ label: 'Off', tone: 'muted' });
    expect(switchBadge({ on: true, running: true, lastRunAt: null })).toEqual({ label: 'Running', tone: 'ok' });
    expect(switchBadge({ on: true, running: false, lastRunAt: null })).toEqual({ label: 'On, not running', tone: 'signal' });
  });

  it('warns only when on and not running, with the server reason', () => {
    expect(switchWarning({ on: true, running: true, lastRunAt: null })).toBeNull();
    expect(switchWarning({ on: false, running: false, lastRunAt: null, error: 'x' })).toBeNull();
    expect(switchWarning({ on: true, running: false, lastRunAt: null, error: ' Stopped. ' })).toBe('Stopped.');
    expect(switchWarning({ on: true, running: false, lastRunAt: null })).toMatch(/not running/);
  });

  it('adds the queued count when Outbound turns on', () => {
    expect(switchToast('Outbound', true, 12)).toBe('Outbound is on. 12 existing contacts queued for their first push.');
    expect(switchToast('Outbound', true, 1)).toBe('Outbound is on. 1 existing contact queued for their first push.');
    expect(switchToast('Outbound', true, 0)).toBe('Outbound is on.');
    expect(switchToast('Inbound', false)).toBe('Inbound is off.');
  });
});

describe('labels', () => {
  it('falls back to the brief table before GET /meta loads', () => {
    expect(healthBadge(undefined, 'token_rejected')).toEqual({ label: 'Token rejected', tone: 'neutral' });
    expect(healthBadge({ crmHealth: [{ value: 'verified', label: 'All good', tone: 'gold' }] }, 'verified')).toEqual({ label: 'All good', tone: 'gold' });
  });

  it('writes the merge tag', () => {
    expect(mergeTag('first_name')).toBe('{{contact.first_name}}');
  });
});

describe('connection and reconcile lines', () => {
  it('says when it was last checked', () => {
    expect(lastCheckedLine(null, NOW)).toBe('Not checked yet');
    expect(lastCheckedLine('2026-10-02T15:55:00Z', NOW)).toBe('Last checked 5 min ago');
    expect(lastCheckedLine('2026-09-26T14:00:00Z', NOW)).toBe('Last checked Sep 26, 10:00 AM');
  });

  it('writes "<time>: checked N contacts, corrected M." or the safety stop', () => {
    expect(reconcileLine({ at: '2026-10-02T07:00:00Z', checked: 412, corrected: 3, halted: false }, NOW)).toEqual({
      kind: 'ok',
      text: 'Oct 2, 3:00 AM: checked 412 contacts, corrected 3.',
    });
    const halted = reconcileLine({ at: '2026-10-02T07:00:00Z', checked: 412, corrected: 0, halted: true, haltReason: 'Too many.' }, NOW);
    expect(halted).toEqual({ kind: 'halted', text: 'Oct 2, 3:00 AM: the safety stop fired.', reason: 'Too many.' });
  });
});

describe('jobs', () => {
  it('uses the timeout copy and stays quiet on aborts and handled statuses', () => {
    expect(jobFailureMessage(new ApiError({ status: 0, code: 'timeout', message: 'x', kind: 'timeout' }), true, 'Slow.')).toBe('Slow.');
    expect(jobFailureMessage(new ApiError({ status: 0, code: 'aborted', message: 'x', kind: 'aborted' }), false, 'Slow.')).toBeNull();
    expect(jobFailureMessage(new ApiError({ status: 403, code: 'owner', message: 'x' }), false, 'Slow.')).toBeNull();
    expect(jobFailureMessage(new ApiError({ status: 502, code: 'sync', message: 'The CRM did not answer.' }), false, 'Slow.')).toBe('The CRM did not answer.');
  });

  it('words the results', () => {
    expect(syncDoneMessage(0)).toBe('Synced. Nothing was waiting.');
    expect(syncDoneMessage(4)).toBe('Synced. 4 items handled.');
  });
});

describe('needs attention', () => {
  it('groups ids by queue, once each', () => {
    expect(groupByQueue([item('a', 'outbox'), item('b', 'inbox'), item('c', 'outbox'), item('a', 'outbox')])).toEqual([
      { queue: 'outbox', ids: ['a', 'c'] },
      { queue: 'inbox', ids: ['b'] },
    ]);
  });

  it('uses the brief line for one item and a plural for several', () => {
    expect(discardQuestion(1)).toBe(DISCARD_ONE);
    expect(discardQuestion(3)).toBe('Stop trying these 3 for good? They stay on record, they are not deleted.');
    expect(discardDoneMessage(1)).toBe('Discarded. It stays on record.');
    expect(discardDoneMessage(2)).toBe('2 items discarded. They stay on record.');
    expect(retryDoneMessage(1)).toBe('1 item queued to try again.');
  });
});

describe('contact inspector', () => {
  const site: CrmInspectSide = { canEmail: false, status: 'Unsubscribed', consented: false, tags: [], lastSyncedAt: null, contactId: null };
  const crm: CrmInspectSide = { canEmail: true, status: 'Mailable', consented: true, tags: ['subscriber'], lastSyncedAt: '2026-10-01T16:00:00Z', contactId: 'ct_1' };

  it('flags "can be emailed" when the sides disagree', () => {
    const rows = compareRows(site, crm, NOW);
    expect(rows.map((r) => r.label)).toEqual(['Can be emailed', 'Status', 'Consented', 'Tags', 'Last synced', 'Contact id']);
    expect(rows[0]).toMatchObject({ site: 'No', crm: 'Yes', disagree: true });
    expect(rows[3]).toMatchObject({ site: 'None', crm: 'subscriber' });
    expect(rows[4]).toMatchObject({ site: 'Never', crm: 'Oct 1, 12:00 PM' });
  });

  it('leaves the CRM column empty when there is no contact', () => {
    const rows = compareRows(site, null, NOW);
    expect(rows.every((r) => r.crm === null)).toBe(true);
    expect(rows[0].disagree).toBe(false);
  });

  it('describes consent events with their source, reason and policy', () => {
    expect(consentLine(undefined, { at: '2026-10-01T16:00:00Z', event: 'unsubscribed', source: 'crm', policyVersion: '2026-04', reason: 'too_many' })).toEqual({
      title: 'Unsubscribed',
      detail: 'via the CRM · Too many emails · Policy 2026-04',
    });
    expect(
      consentLine({ subscriberSources: [{ value: 'footer', label: 'Website footer' }] }, { at: '2026-10-01T16:00:00Z', event: 'subscribed', source: 'footer', policyVersion: null }),
    ).toEqual({ title: 'Subscribed', detail: 'Website footer' });
  });
});
