import { CreditCard } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const subscriptionsModule: ModuleManifest = {
  id: 'subscriptions',
  title: 'Subscriptions',
  icon: CreditCard,
  group: 'customers',
  ownerOnly: false,
  routes: ['(tabs)/customers'],
  href: { pathname: '/customers', params: { segment: 'subscriptions' } },
  searchable: {
    screens: [
      { title: 'Subscriptions', keywords: ['orders', 'billing', 'stripe', 'payments'], href: { pathname: '/customers', params: { segment: 'subscriptions' } } },
    ],
  },
};
