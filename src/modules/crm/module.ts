import { RefreshCcwDot } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const crmModule: ModuleManifest = {
  id: 'crm',
  title: 'CRM sync',
  icon: RefreshCcwDot,
  group: 'marketing',
  capability: 'crm.view',
  routes: ['(tabs)/marketing', 'crm/inspect'],
  href: { pathname: '/marketing', params: { segment: 'crm' } },
  searchable: {
    screens: [
      { title: 'CRM sync', keywords: ['crm', 'sync', 'contacts'], href: { pathname: '/marketing', params: { segment: 'crm' } } },
      { title: 'Contact inspector', keywords: ['crm contact', 'inspect'], href: '/crm/inspect' },
    ],
  },
};
