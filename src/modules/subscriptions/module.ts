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
      { title: 'Subscriptions', keywords: ['billing', 'stripe', 'payments', 'webline care', 'past due'], href: { pathname: '/customers', params: { segment: 'subscriptions' } } },
      {
        title: 'One-time orders',
        keywords: ['orders', 'webline', 'refunds', 'klarna', 'afterpay', 'affirm', 'instalments'],
        href: { pathname: '/customers', params: { segment: 'subscriptions', sub: 'orders' } },
      },
    ],
  },
};
