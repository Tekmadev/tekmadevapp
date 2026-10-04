import { FlaskConical } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const testModeModule: ModuleManifest = {
  id: 'testMode',
  title: 'Test mode',
  icon: FlaskConical,
  group: 'more',
  moreSection: 'settings',
  capability: 'testmode.view',
  routes: ['test-mode'],
  href: '/test-mode',
  summary: 'Stripe sandbox purchases',
  searchable: {
    screens: [
      { title: 'Test mode', keywords: ['sandbox', 'stripe test'], href: '/test-mode' },
    ],
  },
};
