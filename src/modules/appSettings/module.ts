import { SlidersHorizontal } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const appSettingsModule: ModuleManifest = {
  id: 'appSettings',
  title: 'App settings',
  icon: SlidersHorizontal,
  group: 'more',
  moreSection: 'app',
  ownerOnly: false,
  routes: ['settings/index', 'settings/notifications'],
  href: '/settings',
  summary: 'Appearance, notifications, security',
  searchable: {
    screens: [
      { title: 'App settings', keywords: ['theme', 'dark mode', 'appearance', 'security', 'biometric'], href: '/settings' },
      { title: 'Notification settings', keywords: ['push', 'quiet'], href: '/settings/notifications' },
    ],
  },
};
