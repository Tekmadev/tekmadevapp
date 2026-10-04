import { Shield } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const teamModule: ModuleManifest = {
  id: 'team',
  title: 'Team',
  icon: Shield,
  group: 'more',
  moreSection: 'settings',
  capability: 'team.view',
  routes: ['team', 'team-activity'],
  href: '/team',
  summary: 'Owners, managers and staff',
  searchable: {
    screens: [
      { title: 'Team', keywords: ['staff', 'members', 'managers', 'roles', 'pause'], href: '/team' },
      {
        title: 'Team activity',
        keywords: ['scoreboard', 'activity', 'credit', 'commission', 'outreach'],
        href: '/team-activity',
        capability: 'team.activity',
      },
    ],
  },
};
