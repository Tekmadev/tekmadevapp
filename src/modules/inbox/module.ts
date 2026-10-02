import { Bell } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const inboxModule: ModuleManifest = {
  id: 'inbox',
  title: 'Inbox',
  icon: Bell,
  group: 'inbox',
  ownerOnly: false,
  routes: ['inbox'],
  href: '/inbox',
  quickActions: [
    { id: 'inbox', title: 'Inbox', icon: Bell, href: '/inbox', shortcut: { icon: 'shortcut_inbox', order: 1 } },
  ],
  searchable: {
    screens: [
      { title: 'Inbox', keywords: ['notifications', 'alerts'], href: '/inbox' },
    ],
  },
};
