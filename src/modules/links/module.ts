import { Link2 } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const linksModule: ModuleManifest = {
  id: 'links',
  title: 'Links',
  icon: Link2,
  group: 'marketing',
  ownerOnly: true,
  routes: ['(tabs)/marketing', 'links/[id]', 'links/qr/[id]'],
  href: { pathname: '/marketing', params: { segment: 'links' } },
  quickActions: [
    { id: 'new-link', title: 'New link', icon: Link2, href: { pathname: '/marketing', params: { segment: 'links', action: 'new' } }, ownerOnly: true, inPlusSheet: true },
  ],
  searchable: {
    screens: [
      { title: 'Links', keywords: ['short links', 'qr codes', 'utm'], href: { pathname: '/marketing', params: { segment: 'links' } } },
    ],
  },
};
