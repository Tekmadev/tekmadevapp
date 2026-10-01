import { overviewFor } from '../fixtures/overview';
import { ok, type MockRoute } from '../router';

/**
 * Mock routes for the "overview" domain: GET /overview, the Home screen in one
 * call. Any staff may read it; the inbox block is the caller's own and
 * `topLinks` is null for managers (links are owner only). Everything is computed
 * live from the other domains' fixtures (fixtures/overview.ts).
 */
export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/overview',
    latency: 'normal',
    handler: ({ user }) => ok(overviewFor(user)),
  },
];
