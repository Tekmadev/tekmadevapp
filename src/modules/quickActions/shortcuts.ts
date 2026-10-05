import type { Href } from 'expo-router';
import * as QuickActions from 'expo-quick-actions';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { currentVisibility, shortcutActions, useVisibility, type ShortcutAction } from '../registry';
import type { Visibility } from '../types';

/**
 * App shortcuts (long-press the app icon, Android and iPhone): Inbox, New client,
 * Write a post, Analytics, each only for people who hold its capability.
 * Generated from the registry's quick actions that have a `shortcut`,
 * filtered by capability and feature flags, registered while
 * someone is signed in and cleared on sign-out. Tapping one is routed by
 * `useQuickActionRouting(onQuickAction)` in the signed-in layout.
 */

export type ShortcutItem = {
  id: string;
  title: string;
  /**
   * Android: a launcher icon resource generated from app.json (androidIcons
   * keys). iPhone: the matching SF Symbol ("symbol:tray.full").
   */
  icon: string;
  params: { href: string };
};

/** A typed route as the plain path a shortcut can carry ("/blog/new", "/customers?segment=clients"). */
export function hrefToPath(href: Href): string {
  if (typeof href === 'string') return href;
  const params: Record<string, unknown> = { ...(href.params ?? {}) };
  const path = href.pathname.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_, key: string) => {
    const value = params[key];
    delete params[key];
    return Array.isArray(value) ? value.map((v) => encodeURIComponent(String(v))).join('/') : encodeURIComponent(String(value ?? ''));
  });
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : String(v))}`)
    .join('&');
  return query ? `${path}?${query}` : path;
}

/** iPhone shortcut icons are SF Symbols, one per Android launcher icon. */
const IOS_SYMBOLS: Record<string, string> = {
  shortcut_inbox: 'tray.full',
  shortcut_client: 'person.crop.circle.badge.plus',
  shortcut_post: 'square.and.pencil',
  shortcut_analytics: 'chart.bar',
};

/** The icon a shortcut carries on this platform. */
export function shortcutIcon(icon: string, os: typeof Platform.OS = Platform.OS): string {
  if (os !== 'ios') return icon;
  const symbol = IOS_SYMBOLS[icon];
  return symbol ? `symbol:${symbol}` : icon;
}

function toItem(action: ShortcutAction, os: typeof Platform.OS): ShortcutItem {
  return { id: action.id, title: action.title, icon: shortcutIcon(action.shortcut.icon, os), params: { href: hrefToPath(action.href) } };
}

/** The shortcuts this person gets, in launcher order (none when signed out). */
export function shortcutItems(v: Visibility, max: number | undefined = QuickActions.maxCount, os: typeof Platform.OS = Platform.OS): ShortcutItem[] {
  if (!v.role) return [];
  const items = shortcutActions(v).map((action) => toItem(action, os));
  return typeof max === 'number' && max > 0 ? items.slice(0, max) : items;
}

/** Remove every launcher shortcut (sign-out). Never throws. */
export async function clearAppShortcuts(): Promise<void> {
  await QuickActions.setItems([]).catch(() => undefined);
}

/**
 * Keep the launcher shortcuts in step with the signed-in person: set after
 * sign-in, updated when capabilities or feature flags change, cleared when the
 * signed-in area unmounts (any sign-out, including a forced one).
 */
export function useAppShortcuts() {
  const visibility = useVisibility();
  const key = shortcutItems(visibility)
    .map((i) => `${i.id}|${i.title}|${i.params.href}`)
    .join(',');

  useEffect(() => {
    QuickActions.setItems(shortcutItems(currentVisibility())).catch(() => undefined);
  }, [key]);

  useEffect(
    () => () => {
      clearAppShortcuts().catch(() => undefined);
    },
    [],
  );
}

/** The launch action is handled once per app process, not again after a sign-out and sign-in. */
let initialHandled = false;

/**
 * Passed to `useQuickActionRouting`: returns true to stop the router from
 * navigating. A shortcut this person may not use (one left pinned after a
 * role or capability change) is ignored, as is the launch action the second
 * time the signed-in layout mounts. Stable and synchronous, as the hook needs.
 */
export function onQuickAction(action: QuickActions.Action): boolean {
  if (action === QuickActions.initial) {
    if (initialHandled) return true;
    initialHandled = true;
  }
  const allowed = shortcutActions(currentVisibility()).some((a) => a.id === action.id);
  return !allowed;
}
