import type { MockRoute } from '../router';

import { routes as ads } from './ads';
import { routes as analytics } from './analytics';
import { routes as billing } from './billing';
import { routes as blog } from './blog';
import { routes as clients } from './clients';
import { routes as coupons } from './coupons';
import { routes as crm } from './crm';
import { routes as email } from './email';
import { routes as leads } from './leads';
import { routes as links } from './links';
import { routes as notifications } from './notifications';
import { routes as overview } from './overview';
import { routes as pricing } from './pricing';
import { routes as session } from './session';
import { routes as settings } from './settings';
import { routes as team } from './team';
import { routes as testMode } from './testMode';
import { routes as tools } from './tools';

/** Every mock route, one list per domain. Order only matters for identical patterns. */
export function allRoutes(): MockRoute[] {
  return [
    ...session,
    ...overview,
    ...notifications,
    ...clients,
    ...leads,
    ...tools,
    ...billing,
    ...analytics,
    ...ads,
    ...blog,
    ...email,
    ...links,
    ...crm,
    ...pricing,
    ...coupons,
    ...settings,
    ...testMode,
    ...team,
  ];
}
