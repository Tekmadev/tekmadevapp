import { Orbit } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const loaderModule: ModuleManifest = {
  id: 'loader',
  title: 'Loader',
  icon: Orbit,
  group: 'more',
  moreSection: 'settings',
  capability: 'loader.view',
  routes: ['loader'],
  href: '/loader',
  summary: 'The black hole, tuned for the whole site',
  searchable: {
    screens: [
      { title: 'Loader', keywords: ['black hole', 'spinner', 'animation'], href: '/loader' },
    ],
  },
};
