import { BadgePercent } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const couponsModule: ModuleManifest = {
  id: 'coupons',
  title: 'Coupons',
  icon: BadgePercent,
  group: 'more',
  moreSection: 'sales',
  capability: 'coupons.view',
  routes: ['coupons'],
  href: '/coupons',
  summary: 'Discount codes and deal links',
  quickActions: [
    { id: 'new-coupon', title: 'New coupon', icon: BadgePercent, href: { pathname: '/coupons', params: { action: 'new' } }, capability: 'coupons.write', inPlusSheet: true },
  ],
  searchable: {
    screens: [
      { title: 'Coupons', keywords: ['discounts', 'codes', 'deals'], href: '/coupons' },
    ],
  },
};
