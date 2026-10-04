import { Mail } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const emailModule: ModuleManifest = {
  id: 'email',
  title: 'Email',
  icon: Mail,
  group: 'marketing',
  capability: 'email.view',
  routes: ['(tabs)/marketing', 'email/templates', 'email/template/[key]', 'email/subscribers', 'email/subscriber/[id]'],
  href: { pathname: '/marketing', params: { segment: 'email' } },
  searchable: {
    screens: [
      { title: 'Email', keywords: ['campaigns', 'newsletter'], href: { pathname: '/marketing', params: { segment: 'email' } } },
      { title: 'Email templates', keywords: ['templates'], href: '/email/templates' },
      { title: 'Subscribers', keywords: ['audience', 'unsubscribe'], href: '/email/subscribers', capability: 'email.subscribers.view' },
    ],
  },
};
