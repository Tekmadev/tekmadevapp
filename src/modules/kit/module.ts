import { Shapes } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const kitModule: ModuleManifest = {
  id: 'kit',
  title: 'Kit',
  icon: Shapes,
  group: 'more',
  moreSection: 'app',
  ownerOnly: false,
  hidden: true,
  routes: ['kit'],
  href: '/kit',
};
