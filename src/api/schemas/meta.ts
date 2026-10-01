import { z } from 'zod';

import { metaFragment as overview } from './overview';
import { metaFragment as notifications } from './notifications';
import { metaFragment as clients } from './clients';
import { metaFragment as leads } from './leads';
import { metaFragment as tools } from './tools';
import { metaFragment as billing } from './billing';
import { metaFragment as analytics } from './analytics';
import { metaFragment as ads } from './ads';
import { metaFragment as blog } from './blog';
import { metaFragment as email } from './email';
import { metaFragment as links } from './links';
import { metaFragment as crm } from './crm';
import { metaFragment as pricing } from './pricing';
import { metaFragment as coupons } from './coupons';
import { metaFragment as settings } from './settings';
import { metaFragment as testMode } from './testMode';
import { metaFragment as team } from './team';

/**
 * GET /meta: every enum and label the app needs. Each domain contributes its own
 * fragment so labels stay next to the screens that use them. Cached with ETag.
 */
export const zMeta = z.object({
  ...overview.shape,
  ...notifications.shape,
  ...clients.shape,
  ...leads.shape,
  ...tools.shape,
  ...billing.shape,
  ...analytics.shape,
  ...ads.shape,
  ...blog.shape,
  ...email.shape,
  ...links.shape,
  ...crm.shape,
  ...pricing.shape,
  ...coupons.shape,
  ...settings.shape,
  ...testMode.shape,
  ...team.shape,
});
export type Meta = z.infer<typeof zMeta>;
