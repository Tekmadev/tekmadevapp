import { Calculator } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const toolsModule: ModuleManifest = {
  id: 'tools',
  title: 'Free tools',
  icon: Calculator,
  group: 'customers',
  ownerOnly: false,
  routes: ['(tabs)/customers', 'tools/[id]'],
  href: { pathname: '/customers', params: { segment: 'tools' } },
  searchable: {
    screens: [
      { title: 'Free tools', keywords: ['calculator', 'lead magnet', 'submissions'], href: { pathname: '/customers', params: { segment: 'tools' } } },
    ],
  },
};
