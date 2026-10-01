import { UserRound } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const leadsModule: ModuleManifest = {
  id: 'leads',
  title: 'Leads',
  icon: UserRound,
  group: 'customers',
  ownerOnly: false,
  routes: ['(tabs)/customers', 'leads/[id]'],
  href: { pathname: '/customers', params: { segment: 'leads' } },
  searchable: {
    screens: [
      { title: 'Leads', keywords: ['bookings', 'lead forms', 'prospects'], href: { pathname: '/customers', params: { segment: 'leads' } } },
    ],
  },
};
