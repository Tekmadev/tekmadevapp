import { zLeadNeed, zLeadSource, zLeadStatus } from '../../schemas/leads';
import { findLead, leadsDb } from '../fixtures/leads';
import { requireCap } from '../permissions';
import { fail, matches, ok, paginate, type MockRoute } from '../router';

/**
 * Mock routes for the "leads" domain (contract section 11, Customers).
 * Search and filters run here, like on the server. Unknown filter values are a
 * 400 (written up in docs/api-requests/leads.md) rather than a silent empty list.
 * Reads need `leads.view` (every role).
 */

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/leads',
    latency: 'normal',
    handler: ({ query, user }) => {
      const denied = requireCap(user, 'leads.view');
      if (denied) return denied;
      const source = query.source ? zLeadSource.safeParse(query.source) : undefined;
      if (source && !source.success) return fail(400, 'source', 'Unknown lead source.');
      const status = query.status ? zLeadStatus.safeParse(query.status) : undefined;
      if (status && !status.success) return fail(400, 'status', 'Unknown lead status.');
      const need = query.need ? zLeadNeed.safeParse(query.need) : undefined;
      if (need && !need.success) return fail(400, 'need', 'Unknown lead need.');

      const rows = leadsDb.filter(
        (lead) =>
          (!source?.success || lead.source === source.data) &&
          (!status?.success || lead.status === status.data) &&
          (!need?.success || lead.need === need.data) &&
          matches(query.q, lead.name, lead.email, lead.business, lead.phone),
      );
      return ok(paginate(rows, query));
    },
  },
  {
    method: 'GET',
    path: '/leads/:id',
    latency: 'fast',
    handler: ({ params, user }) => {
      const denied = requireCap(user, 'leads.view');
      if (denied) return denied;
      const lead = findLead(params.id);
      return lead ? ok(lead) : fail(404, 'not_found', 'That lead no longer exists.');
    },
  },
];
