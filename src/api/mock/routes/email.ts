import { zSubscriberStatus, type SubscriberStatus } from '../../schemas/email';
import { dropQueued, queueOutbox } from '../fixtures/crm';
import {
  addConsentEvent,
  CURRENT_POLICY_VERSION,
  emailCampaigns,
  emailOverview,
  emailTemplates,
  erasedEmails,
  ERASE_FAILS_SUBSCRIBER_ID,
  findSubscriber,
  consentHistory,
  subscribers,
  toCampaign,
  toSubscriberDetail,
} from '../fixtures/email';
import { bool, fail, matches, mockId, notFound, nowIso, ok, paginate, str, type MockResult, type MockRoute } from '../router';

/**
 * Mock routes for the "email" domain (contract section 11, Marketing > Email).
 * Owner only. Campaigns are tracking registrations (this app never sends email);
 * unsubscribes and erasures queue the matching push to the CRM.
 * Rules the contract does not spell out are in docs/api-requests/email.md.
 */

const KEY_MESSAGE = 'Enter a campaign key using letters, numbers and dashes.';
const NAME_MESSAGE = 'Enter a campaign name.';
const DUPE_MESSAGE = 'A campaign with that key already exists. Pick another.';
const CRM_ERASE_MESSAGE = 'Not deleted: the CRM erasure could not be queued, so their CRM contact would have stayed mailable. Try again.';
const CAMPAIGN_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAMPAIGN_KEY_MAX = 64;

const campaignMissing = () => notFound('That campaign');
const subscriberMissing = () => notFound('That subscriber');

/** Optional text: trimmed, blank or missing becomes null. */
const text = (value: unknown) => {
  const s = str(value)?.trim();
  return s ? s : null;
};

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/email/overview',
    ownerOnly: true,
    latency: 'normal',
    handler: () => ok(emailOverview()),
  },
  {
    method: 'POST',
    path: '/email/campaigns',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ body }) => {
      // The form lowercases live; the server does too, then validates.
      const key = str(body.key)?.trim().toLowerCase() ?? '';
      const name = str(body.name)?.trim() ?? '';
      const fields: Record<string, string> = {};
      if (!CAMPAIGN_KEY.test(key) || key.length > CAMPAIGN_KEY_MAX) fields.key = KEY_MESSAGE;
      if (!name) fields.name = NAME_MESSAGE;
      if (fields.key) return fail(400, 'key', KEY_MESSAGE, fields);
      if (fields.name) return fail(400, 'name', NAME_MESSAGE, fields);
      if (emailCampaigns.some((c) => c.key === key)) return fail(409, 'dupe', DUPE_MESSAGE, { key: DUPE_MESSAGE });
      const record = {
        id: mockId('camp'),
        key,
        name,
        subject: text(body.subject),
        template: text(body.template),
        description: text(body.description),
        active: true,
        createdAt: nowIso(),
      };
      emailCampaigns.push(record);
      return ok(toCampaign(record), 201);
    },
  },
  {
    method: 'PATCH',
    path: '/email/campaigns/:id',
    ownerOnly: true,
    latency: 'fast',
    handler: ({ params, body }) => {
      const record = emailCampaigns.find((c) => c.id === params.id);
      if (!record) return campaignMissing();
      const active = bool(body.active);
      if (active === undefined) return fail(400, 'active', 'Send active as true or false.', { active: 'Send active as true or false.' });
      // Pausing is a label only: opens and clicks are still counted.
      record.active = active;
      return ok(toCampaign(record));
    },
  },
  {
    method: 'DELETE',
    path: '/email/campaigns/:id',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ params }) => {
      const index = emailCampaigns.findIndex((c) => c.id === params.id);
      if (index < 0) return campaignMissing();
      // Past opens and clicks stay in the log; only the registration goes.
      emailCampaigns.splice(index, 1);
      return ok(null);
    },
  },
  {
    method: 'GET',
    path: '/email/templates',
    ownerOnly: true,
    latency: 'fast',
    handler: () => ok(emailTemplates),
  },
  {
    method: 'GET',
    path: '/email/subscribers',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ query }) => {
      let status: SubscriberStatus | undefined;
      if (query.status) {
        const parsed = zSubscriberStatus.safeParse(query.status);
        if (!parsed.success) return fail(400, 'status', 'Pick a valid status.');
        status = parsed.data;
      }
      const rows = subscribers
        .filter((s) => (!status || s.status === status) && matches(query.q, s.email))
        .sort((a, b) => b.signedUpAt.localeCompare(a.signedUpAt) || b.id.localeCompare(a.id));
      return ok(paginate(rows, query));
    },
  },
  {
    method: 'GET',
    path: '/email/subscribers/:id',
    ownerOnly: true,
    latency: 'fast',
    handler: ({ params }) => {
      const record = findSubscriber(params.id);
      return record ? ok(toSubscriberDetail(record)) : subscriberMissing();
    },
  },
  {
    method: 'POST',
    path: '/email/subscribers/:id/unsubscribe',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ params }): MockResult => {
      const record = findSubscriber(params.id);
      if (!record) return subscriberMissing();
      if (record.status !== 'active') return fail(409, 'not_active', 'Only active subscribers can be unsubscribed.');
      const at = nowIso();
      record.status = 'unsubscribed';
      record.unsubscribeSource = 'admin';
      record.reason = null;
      record.unsubscribedAt = at;
      addConsentEvent(record.id, { at, event: 'unsubscribed', source: 'admin', policyVersion: CURRENT_POLICY_VERSION });
      // Every unsubscribe goes to the CRM as email DND.
      if (record.inCrm) queueOutbox(record.email, 'dnd', at);
      return ok(toSubscriberDetail(record));
    },
  },
  {
    method: 'DELETE',
    path: '/email/subscribers/:id',
    ownerOnly: true,
    latency: 'slow',
    handler: ({ params }) => {
      const index = subscribers.findIndex((s) => s.id === params.id);
      if (index < 0) return subscriberMissing();
      // Seeded failure: the erasure cannot be queued, so nothing is deleted.
      if (params.id === ERASE_FAILS_SUBSCRIBER_ID) return fail(500, 'crm_erase', CRM_ERASE_MESSAGE);
      const [record] = subscribers.splice(index, 1);
      consentHistory.delete(record.id);
      erasedEmails.add(record.email.toLowerCase());
      // The CRM contact is suppressed and tagged erased, and never pushed again.
      dropQueued(record.email);
      queueOutbox(record.email, 'erase', nowIso());
      return ok(null);
    },
  },
];
