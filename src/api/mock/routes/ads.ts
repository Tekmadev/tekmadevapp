import { DEFAULT_ADS_RANGE, zAdsRange } from '../../schemas/ads';
import { AD_ACCOUNT_ID, adsReport, adsState, META_PULL_ERROR, refreshRowCount } from '../fixtures/ads';
import { recordNotificationEvent } from '../fixtures/notifications';
import { requireCap } from '../permissions';
import { fail, nowIso, ok, type MockRoute } from '../router';

/**
 * Mock routes for the "ads" domain (contract section 11, Insights): `ads.view`
 * reads, `ads.refresh` pulls (requireCap in each handler, like the server).
 *
 * POST /ads/refresh is a long job (about 6 seconds). Every 3rd call fails with
 * 502 `upstream`, so both toasts can be seen from the app: success
 * ("Pulled {n} ad-day rows from Meta.") and failure (the server's message). A
 * failure also bumps the "Meta pull failed" row in the inbox, which is where the
 * failure message sends the owner.
 */

const REFUSED = 'Meta refused the pull. The inbox has the reason; an expired token is the usual cause.';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/ads',
    latency: 'normal',
    handler: ({ query, user }) => {
      const denied = requireCap(user, 'ads.view');
      if (denied) return denied;
      const range = zAdsRange.safeParse(query.range ?? DEFAULT_ADS_RANGE);
      if (!range.success) return fail(400, 'range', 'Unknown range. Use 7d, 14d, 30d, 3m or all.');
      // Not connected: no numbers at all, never zeros.
      if (!adsState.connected) return ok({ connected: false, range: range.data, lastSync: null });
      return ok(adsReport(range.data));
    },
  },
  {
    method: 'POST',
    path: '/ads/refresh',
    latency: 'long',
    jobMs: 6000,
    handler: ({ user }) => {
      const denied = requireCap(user, 'ads.refresh');
      if (denied) return denied;
      if (!adsState.connected) return fail(503, 'not_configured', 'The server is missing a setting for this feature.');
      adsState.refreshCalls += 1;
      if (adsState.refreshCalls % 3 === 0) {
        adsState.lastSync = { at: nowIso(), ok: false, error: META_PULL_ERROR };
        recordNotificationEvent({
          event_key: 'system.meta_pull_failed',
          title: 'Meta pull failed',
          body: 'Meta refused the pull: the access token expired. Generate a new token, update it on the server, then refresh Ads.',
          action_url: '/admin/ads',
          entity_type: 'ads_account',
          entity_id: AD_ACCOUNT_ID,
          actor_type: 'system',
          actor_label: 'Ads sync',
          data: { metaCode: 190, metaSubcode: 463 },
        });
        return fail(502, 'upstream', REFUSED);
      }
      adsState.lastSync = { at: nowIso(), ok: true, error: null };
      return ok({ rowsUpserted: refreshRowCount() });
    },
  },
];
