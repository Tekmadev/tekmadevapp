import { Settings } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const profileModule: ModuleManifest = {
  id: 'profile',
  title: 'Profile',
  icon: Settings,
  group: 'more',
  moreSection: 'settings',
  ownerOnly: false,
  routes: ['profile'],
  href: '/profile',
  summary: 'Your name and password',
  searchable: {
    screens: [
      { title: 'Profile', keywords: ['password', 'account'], href: '/profile' },
    ],
  },
};
