import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';

import type { Role } from '@/api/types';

/**
 * Every feature is a module with a manifest. Tabs, the More menu, global search
 * (screens), quick actions and Android app shortcuts are generated from the
 * registry, filtered by role and by the `features` flags from GET /me.
 * Adding a future automation is adding a module, not editing navigation code.
 */

export type ModuleGroup = 'home' | 'inbox' | 'customers' | 'marketing' | 'more';

/** Sections inside the More tab (and the order they appear in). */
export type MoreSection = 'insights' | 'sales' | 'settings' | 'app';

export type QuickAction = {
  id: string;
  title: string;
  icon: LucideIcon;
  href: Href;
  ownerOnly?: boolean;
  /** Also offered as an Android launcher shortcut (long-press the icon). */
  shortcut?: { icon: string; order: number };
  /** Shown in the gold + sheet on Home and Customers. */
  inPlusSheet?: boolean;
};

/** A screen the global search can jump to ("Pricing", "Loader"...). */
export type ScreenEntry = { title: string; keywords?: string[]; href: Href };

export type SearchProvider = {
  /** Screens this module contributes to search results. */
  screens: ScreenEntry[];
};

export type ModuleManifest = {
  id: string;
  title: string;
  icon: LucideIcon;
  group: ModuleGroup;
  /** Section inside More (only for group "more"). */
  moreSection?: MoreSection;
  ownerOnly: boolean;
  /** Server feature flag from GET /me; the module is hidden when absent. */
  feature?: string;
  /** Route paths (app/ files) owned by this module, for docs and guards. */
  routes: string[];
  /** Where the module's main screen lives. */
  href: Href;
  /** One line under the title in the More menu. */
  summary?: string;
  quickActions?: QuickAction[];
  searchable?: SearchProvider;
  /** Hidden from menus (reachable by deep link or an easter egg only). */
  hidden?: boolean;
};

export type Visibility = { role: Role | null; features: readonly string[] | undefined };

export function isVisible(m: Pick<ModuleManifest, 'ownerOnly' | 'feature'>, v: Visibility): boolean {
  if (!v.role) return false;
  if (m.ownerOnly && v.role !== 'owner') return false;
  if (m.feature && !(v.features ?? []).includes(m.feature)) return false;
  return true;
}
