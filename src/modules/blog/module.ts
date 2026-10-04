import { FileText } from 'lucide-react-native';

import type { ModuleManifest } from '../types';

export const blogModule: ModuleManifest = {
  id: 'blog',
  title: 'Blog',
  icon: FileText,
  group: 'marketing',
  capability: 'blog.view',
  routes: ['(tabs)/marketing', 'blog/[id]', 'blog/categories'],
  href: { pathname: '/marketing', params: { segment: 'blog' } },
  quickActions: [
    { id: 'write-post', title: 'Write a post', icon: FileText, href: { pathname: '/blog/[id]', params: { id: 'new' } }, capability: 'blog.write', inPlusSheet: true, shortcut: { icon: 'shortcut_post', order: 3 } },
  ],
  searchable: {
    screens: [
      { title: 'Blog', keywords: ['posts', 'articles', 'writing'], href: { pathname: '/marketing', params: { segment: 'blog' } } },
      { title: 'Blog categories', keywords: ['categories'], href: '/blog/categories' },
    ],
  },
};
