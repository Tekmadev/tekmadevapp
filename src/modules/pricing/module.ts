import { Tag } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const pricingModule: ModuleManifest = {
  id: 'pricing',
  title: 'Pricing',
  icon: Tag,
  group: 'more',
  moreSection: 'sales',
  capability: 'pricing.view',
  routes: ['pricing'],
  href: '/pricing',
  summary: 'Plans, Webline, sales tax',
  searchable: {
    screens: [
      { title: 'Pricing', keywords: ['plans', 'prices', 'tax', 'stripe'], href: '/pricing' },
    ],
  },
};
