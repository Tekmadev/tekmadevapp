import { useMemo } from 'react';

import { useSession } from '@/auth/session';

import { adsModule } from './ads/module';
import { analyticsModule } from './analytics/module';
import { appSettingsModule } from './appSettings/module';
import { assistantModule } from './assistant/module';
import { blogModule } from './blog/module';
import { clientsModule } from './clients/module';
import { couponsModule } from './coupons/module';
import { crmModule } from './crm/module';
import { emailModule } from './email/module';
import { inboxModule } from './inbox/module';
import { kitModule } from './kit/module';
import { leadsModule } from './leads/module';
import { linksModule } from './links/module';
import { loaderModule } from './loader/module';
import { overviewModule } from './overview/module';
import { pricingModule } from './pricing/module';
import { profileModule } from './profile/module';
import { subscriptionsModule } from './subscriptions/module';
import { teamModule } from './team/module';
import { testModeModule } from './testMode/module';
import { toolsModule } from './tools/module';
import { isVisible, type ModuleGroup, type ModuleManifest, type MoreSection, type QuickAction, type ScreenEntry, type Visibility } from './types';

/**
 * The module registry, in display order. A future automation ships as a new
 * module here (with a `feature` flag) and stays hidden until GET /me lists it.
 */
export const MODULES: readonly ModuleManifest[] = [
  overviewModule,
  inboxModule,
  clientsModule,
  leadsModule,
  toolsModule,
  subscriptionsModule,
  blogModule,
  emailModule,
  linksModule,
  crmModule,
  analyticsModule,
  adsModule,
  pricingModule,
  couponsModule,
  loaderModule,
  testModeModule,
  teamModule,
  profileModule,
  appSettingsModule,
  kitModule,
  assistantModule,
];

export type TabId = ModuleGroup;
export type TabDef = { id: TabId; title: string; route: 'index' | 'customers' | 'analytics' | 'marketing' | 'more' };

/**
 * The tabs, in order. A tab shows when at least one visible module belongs to it.
 * The Inbox is not a tab (owner decision): it opens from the bell in every tab
 * header; its tab slot went to Analytics (owner decision).
 */
export const TABS: readonly TabDef[] = [
  { id: 'home', title: 'Home', route: 'index' },
  { id: 'customers', title: 'Customers', route: 'customers' },
  { id: 'analytics', title: 'Analytics', route: 'analytics' },
  { id: 'marketing', title: 'Marketing', route: 'marketing' },
  { id: 'more', title: 'More', route: 'more' },
];

export const MORE_SECTIONS: readonly { id: MoreSection; title: string }[] = [
  { id: 'insights', title: 'Insights' },
  { id: 'sales', title: 'Sales' },
  { id: 'settings', title: 'Settings' },
  { id: 'app', title: 'App' },
];

export function visibleModules(v: Visibility): ModuleManifest[] {
  return MODULES.filter((m) => isVisible(m, v));
}

export function visibleTabs(v: Visibility): TabDef[] {
  const mods = visibleModules(v);
  return TABS.filter((t) => t.id === 'more' || mods.some((m) => m.group === t.id && !m.hidden));
}

export function quickActionsFor(v: Visibility): QuickAction[] {
  return visibleModules(v).flatMap((m) =>
    (m.quickActions ?? []).filter((q) => !q.ownerOnly || v.role === 'owner'),
  );
}

export function searchableScreens(v: Visibility): (ScreenEntry & { moduleId: string })[] {
  return visibleModules(v).flatMap((m) => (m.searchable?.screens ?? []).map((s) => ({ ...s, moduleId: m.id })));
}

export function moduleById(id: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.id === id);
}

export type MoreMenuSection = { id: MoreSection; title: string; modules: ModuleManifest[] };

/**
 * The More tab's menu: visible "more" modules (hidden ones excluded) grouped by
 * section in MORE_SECTIONS order. A section with nothing visible is dropped, so
 * a manager sees no Insights section at all.
 */
export function moreMenu(v: Visibility): MoreMenuSection[] {
  const mods = visibleModules(v).filter((m) => m.group === 'more' && !m.hidden && m.moreSection);
  return MORE_SECTIONS.map((s) => ({ ...s, modules: mods.filter((m) => m.moreSection === s.id) })).filter(
    (s) => s.modules.length > 0,
  );
}

/** The brief's order for the + sheet; actions not listed (future modules) follow in registry order. */
const PLUS_SHEET_ORDER: readonly string[] = ['new-client', 'log-call', 'write-post', 'new-coupon', 'new-link'];

/** The gold + sheet on Home and Customers. */
export function plusSheetActions(v: Visibility): QuickAction[] {
  const rank = (a: QuickAction) => {
    const i = PLUS_SHEET_ORDER.indexOf(a.id);
    return i < 0 ? PLUS_SHEET_ORDER.length : i;
  };
  return quickActionsFor(v)
    .filter((a) => a.inPlusSheet)
    .map((a, index) => ({ a, index }))
    .sort((x, y) => rank(x.a) - rank(y.a) || x.index - y.index)
    .map((x) => x.a);
}

export type ShortcutAction = QuickAction & { shortcut: NonNullable<QuickAction['shortcut']> };

/** Android launcher shortcuts (long-press the icon), in `shortcut.order`. */
export function shortcutActions(v: Visibility): ShortcutAction[] {
  return quickActionsFor(v)
    .filter((a): a is ShortcutAction => a.shortcut !== undefined)
    .sort((a, b) => a.shortcut.order - b.shortcut.order);
}

/** Visibility for the signed-in user outside React (quick action routing, stores). */
export function currentVisibility(): Visibility {
  const me = useSession.getState().me;
  return { role: me?.role ?? null, features: me?.features };
}

/** Visibility for the signed-in user (role + feature flags from GET /me). */
export function useVisibility(): Visibility {
  const role = useSession((s) => s.me?.role ?? null);
  const features = useSession((s) => s.me?.features);
  return useMemo(() => ({ role, features }), [role, features]);
}

export function useVisibleModules() {
  const v = useVisibility();
  return useMemo(() => visibleModules(v), [v]);
}
