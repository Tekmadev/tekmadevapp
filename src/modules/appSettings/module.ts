import { SlidersHorizontal } from 'lucide-react-native';
import { Platform } from 'react-native';

import type { ModuleManifest } from '../types';

export const appSettingsModule: ModuleManifest = {
  id: 'appSettings',
  title: 'App settings',
  icon: SlidersHorizontal,
  group: 'more',
  moreSection: 'app',
  routes: ['settings/index', 'settings/notifications'],
  href: '/settings',
  summary: 'Appearance, notifications, security',
  searchable: {
    screens: [
      {
        title: 'App settings',
        keywords: [
          'theme',
          'dark mode',
          'appearance',
          'security',
          'biometric',
          // What an iPhone calls its biometric unlock and its app switcher.
          ...(Platform.OS === 'ios' ? ['face id', 'touch id', 'passcode', 'app switcher'] : []),
        ],
        href: '/settings',
      },
      { title: 'Notification settings', keywords: ['push', 'quiet'], href: '/settings/notifications', capability: 'notifications.view' },
    ],
  },
};
