import { Sparkles } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const assistantModule: ModuleManifest = {
  id: 'assistant',
  title: 'Assistant',
  icon: Sparkles,
  group: 'more',
  moreSection: 'app',
  ownerOnly: true,
  feature: 'assistant',
  hidden: true,
  routes: ['assistant'],
  href: '/assistant',
};
