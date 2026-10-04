import { findToolSubmission, toolDetail, toolRow, toolStats, toolSubmissionsDb } from '../fixtures/tools';
import { requireCap } from '../permissions';
import { fail, ok, paginate, type MockRoute } from '../router';

/** Mock routes for the "tools" domain (free tool submissions; contract section 11, Customers). Reads need `tools.view`. */

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/tools/stats',
    latency: 'fast',
    handler: ({ user }) => requireCap(user, 'tools.view') ?? ok(toolStats()),
  },
  {
    method: 'GET',
    path: '/tools/submissions',
    latency: 'normal',
    handler: ({ query, user }) => {
      const denied = requireCap(user, 'tools.view');
      if (denied) return denied;
      const page = paginate(toolSubmissionsDb, query);
      return ok({ items: page.items.map(toolRow), nextCursor: page.nextCursor });
    },
  },
  {
    method: 'GET',
    path: '/tools/submissions/:id',
    latency: 'fast',
    handler: ({ params, user }) => {
      const denied = requireCap(user, 'tools.view');
      if (denied) return denied;
      const submission = findToolSubmission(params.id);
      return submission ? ok(toolDetail(submission)) : fail(404, 'not_found', 'That submission no longer exists.');
    },
  },
];
