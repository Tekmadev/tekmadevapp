import { Shield } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const teamModule: ModuleManifest = {
  id: 'team',
  title: 'Team',
  icon: Shield,
  group: 'more',
  moreSection: 'settings',
  ownerOnly: true,
  routes: ['team'],
  href: '/team',
  summary: 'Owners and managers',
  searchable: {
    screens: [
      { title: 'Team', keywords: ['staff', 'members', 'managers'], href: '/team' },
    ],
  },
};
