import { BarChart3 } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const analyticsModule: ModuleManifest = {
  id: 'analytics',
  title: 'Analytics',
  icon: BarChart3,
  group: 'analytics',
  capability: 'analytics.view',
  routes: ['analytics'],
  href: '/analytics',
  summary: 'Pageviews, sources, devices',
  quickActions: [
    { id: 'analytics', title: 'Analytics', icon: BarChart3, href: '/analytics', shortcut: { icon: 'shortcut_analytics', order: 4 } },
  ],
  searchable: {
    screens: [
      { title: 'Analytics', keywords: ['traffic', 'pageviews', 'visitors'], href: '/analytics' },
    ],
  },
};
