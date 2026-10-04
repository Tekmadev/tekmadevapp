import { Shield } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const teamModule: ModuleManifest = {
  id: 'team',
  title: 'Team',
  icon: Shield,
  group: 'more',
  moreSection: 'settings',
  capability: 'team.view',
  routes: ['team'],
  href: '/team',
  summary: 'Owners, managers and staff',
  searchable: {
    screens: [
      { title: 'Team', keywords: ['staff', 'members', 'managers', 'roles'], href: '/team' },
    ],
  },
};
