import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';

import type { Role } from '@/api/types';
import { can, capabilitiesOf, type Capability } from '@/auth/capabilities';

/**
 * Every feature is a module with a manifest. Tabs, the More menu, global search
 * (screens), quick actions and Android app shortcuts are generated from the
 * registry, filtered by the person's capabilities (GET /me `capabilities`, or
 * the role's fallback row) and by the `features` flags from GET /me.
 * Adding a future automation is adding a module, not editing navigation code.
 */

export type ModuleGroup = 'home' | 'inbox' | 'customers' | 'analytics' | 'marketing' | 'more';

/** Sections inside the More tab (and the order they appear in). */
export type MoreSection = 'insights' | 'sales' | 'settings' | 'app';

export type QuickAction = {
  id: string;
  title: string;
  icon: LucideIcon;
  href: Href;
  /** Shown only to people who hold this capability (on top of the module's own). */
  capability?: Capability;
  /** Also offered as an Android launcher shortcut (long-press the icon). */
  shortcut?: { icon: string; order: number };
  /** Shown in the gold + sheet on Home and Customers. */
  inPlusSheet?: boolean;
};

/** A screen the global search can jump to ("Pricing", "Loader"...). */
export type ScreenEntry = {
  title: string;
  keywords?: string[];
  href: Href;
  /** Found only by people who hold this capability (on top of the module's own). */
  capability?: Capability;
};

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
  /**
   * The capability that shows this module (its tab, More row, search screens,
   * quick actions and shortcuts). None: everyone signed in (Profile, App settings).
   */
  capability?: Capability;
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

/**
 * Who is looking: the signed-in person's role, feature flags and capabilities.
 * Without `capabilities`, the role's fallback row is used.
 */
export type Visibility = {
  role: Role | null;
  features: readonly string[] | undefined;
  capabilities?: readonly Capability[];
};

/** The capabilities behind a Visibility (nobody signed in: none). */
export function visibilityCapabilities(v: Visibility): readonly Capability[] {
  if (!v.role) return [];
  return v.capabilities ?? capabilitiesOf(v.role);
}

/** Whether this person may see something gated by `capability` (no capability: everyone signed in). */
export function visibleTo(capability: Capability | undefined, v: Visibility): boolean {
  if (!v.role) return false;
  return !capability || can(visibilityCapabilities(v), capability);
}

export function isVisible(m: Pick<ModuleManifest, 'capability' | 'feature'>, v: Visibility): boolean {
  if (!visibleTo(m.capability, v)) return false;
  if (m.feature && !(v.features ?? []).includes(m.feature)) return false;
  return true;
}
