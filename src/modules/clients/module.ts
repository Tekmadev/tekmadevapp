import { Building2, Phone } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const clientsModule: ModuleManifest = {
  id: 'clients',
  title: 'Clients',
  icon: Building2,
  group: 'customers',
  ownerOnly: false,
  routes: ['(tabs)/customers', 'clients/new', 'clients/[id]', 'clients/templates'],
  href: { pathname: '/customers', params: { segment: 'clients' } },
  quickActions: [
    { id: 'new-client', title: 'New client', icon: Building2, href: '/clients/new', inPlusSheet: true, shortcut: { icon: 'shortcut_client', order: 2 } },
    { id: 'log-call', title: 'Log a booked call', icon: Phone, href: { pathname: '/customers', params: { segment: 'clients', action: 'log-call' } }, inPlusSheet: true },
  ],
  searchable: {
    screens: [
      { title: 'Clients', keywords: ['customers', 'accounts', 'onboarding'], href: { pathname: '/customers', params: { segment: 'clients' } } },
      { title: 'New client', keywords: ['add client', 'create client'], href: '/clients/new' },
    ],
  },
};
