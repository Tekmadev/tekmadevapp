import { UserPlus, UserRound } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const leadsModule: ModuleManifest = {
  id: 'leads',
  title: 'Leads',
  icon: UserRound,
  group: 'customers',
  capability: 'leads.view',
  routes: ['(tabs)/customers', 'leads/[id]'],
  href: { pathname: '/customers', params: { segment: 'leads' } },
  quickActions: [
    // Opens the Leads segment with the "Add a lead" sheet (LeadsSegment reads the one-shot action).
    {
      id: 'add-lead',
      title: 'Add a lead',
      icon: UserPlus,
      href: { pathname: '/customers', params: { segment: 'leads', action: 'add-lead' } },
      capability: 'leads.create',
      inPlusSheet: true,
    },
  ],
  searchable: {
    screens: [
      { title: 'Leads', keywords: ['bookings', 'lead forms', 'prospects'], href: { pathname: '/customers', params: { segment: 'leads' } } },
    ],
  },
};
