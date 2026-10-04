import { Megaphone } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const adsModule: ModuleManifest = {
  id: 'ads',
  title: 'Ads',
  icon: Megaphone,
  group: 'more',
  moreSection: 'insights',
  capability: 'ads.view',
  routes: ['ads/index', 'ads/[campaignId]'],
  href: '/ads',
  summary: 'Meta spend and what it brought in',
  searchable: {
    screens: [
      { title: 'Ads', keywords: ['meta', 'facebook', 'campaigns', 'spend'], href: '/ads' },
    ],
  },
};
