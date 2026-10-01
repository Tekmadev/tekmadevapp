import { metaFixture as overview } from './overview';
import { metaFixture as notifications } from './notifications';
import { metaFixture as clients } from './clients';
import { metaFixture as leads } from './leads';
import { metaFixture as tools } from './tools';
import { metaFixture as billing } from './billing';
import { metaFixture as analytics } from './analytics';
import { metaFixture as ads } from './ads';
import { metaFixture as blog } from './blog';
import { metaFixture as email } from './email';
import { metaFixture as links } from './links';
import { metaFixture as crm } from './crm';
import { metaFixture as pricing } from './pricing';
import { metaFixture as coupons } from './coupons';
import { metaFixture as settings } from './settings';
import { metaFixture as testMode } from './testMode';
import { metaFixture as team } from './team';

/** The GET /meta fixture, composed from every domain's fragment. */
export const metaFixture = {
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
};
