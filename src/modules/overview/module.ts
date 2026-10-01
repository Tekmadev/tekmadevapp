import { LayoutDashboard } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const overviewModule: ModuleManifest = {
  id: 'overview',
  title: 'Overview',
  icon: LayoutDashboard,
  group: 'home',
  ownerOnly: false,
  routes: ['(tabs)/index'],
  href: '/',
  searchable: {
    screens: [
      { title: 'Overview', keywords: ['home', 'dashboard', 'kpi'], href: '/' },
    ],
  },
};
