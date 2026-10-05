import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPref,
  type NotificationPrefs,
} from '@/api/schemas/notifications';
import { plural } from '@/lib/format';
import type { LockAfter, ThemePreference } from '@/lib/prefs';

/**
 * App settings rules that need no device (brief 8.18): copy, the order and
 * labels of the notification rows, the optimistic pref patches and their
 * rollback, and the Kit easter egg's tap counter. Unit tested in __tests__.
 */

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

export const SETTINGS_COPY = {
  title: 'App settings',
  appearance: 'Appearance',
  notifications: 'Notifications',
  notificationsRow: 'Notifications',
  notificationsRowHint: 'Quiet and push, for each category',
  security: 'Security',
  biometric: 'Biometric unlock',
  biometricOn: 'Biometric unlock is on.',
  biometricOff: 'Biometric unlock is off.',
  lockAfter: 'Lock after',
  lockAfterHelp: 'How long the app can be away before it asks again.',
  hideInRecents: 'Hide content in the recent apps screen',
  hideInRecentsAndroid: 'Recent apps shows a blank card. Screenshots and screen recordings are blocked too.',
  /** iPhone has an app switcher, not a recent apps screen. */
  hideInRecentsIosLabel: 'Hide content in the app switcher',
  hideInRecentsIos: 'The app switcher shows the Tekmadev mark instead of the screen.',
  data: 'Data',
  clearCache: 'Clear cached data',
  clearCacheHint: 'Your session, settings and drafts stay.',
  clearCacheTitle: 'Clear cached data?',
  clearCacheMessage:
    'Removes what the app keeps on this phone to open fast, saved images included. Your session, settings and drafts stay. Screens load fresh from the server.',
  clearCacheConfirm: 'Hold to clear',
  clearCachePending: 'Clearing',
  clearCacheDone: 'Cached data cleared.',
  about: 'About',
  version: 'Version',
  build: 'Build',
  apiMode: 'API mode',
  checkUpdates: 'Check for updates',
  checking: 'Checking',
  latest: "You're on the latest version.",
  signOut: 'Sign out',
} as const;

/** The "Hide content" row in the words of the platform (the brief's words on Android). */
export function hideInRecentsCopy(platform: string): { label: string; description: string } {
  return platform === 'ios'
    ? { label: SETTINGS_COPY.hideInRecentsIosLabel, description: SETTINGS_COPY.hideInRecentsIos }
    : { label: SETTINGS_COPY.hideInRecents, description: SETTINGS_COPY.hideInRecentsAndroid };
}

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const LOCK_AFTER_OPTIONS: readonly { value: LockAfter; label: string }[] = [
  { value: 'immediately', label: 'Immediately' },
  { value: '1m', label: '1 min' },
  { value: '5m', label: '5 min' },
  { value: '15m', label: '15 min' },
];

export const PREFS_COPY = {
  title: 'Notifications',
  subtitle: 'For each category',
  quiet: 'Quiet',
  push: 'Push',
  quietHint: 'Does not count toward unread',
  pushHint: 'Phone notification',
  legend: 'Quiet: does not count toward unread. Push: a phone notification.',
  empty: 'No notification categories yet.',
  test: 'Send a test notification',
  testPending: 'Sending',
  testHelp: 'Sends a test notification to this phone.',
  pushNotSetUp: 'Push is not set up on this phone yet. Notifications still show in the Inbox.',
} as const;

/** "Test sent to this phone." or "Test sent to 2 phones on your account." */
export function testPushMessage(sent: number, toThisPhone: boolean): string {
  if (toThisPhone) return 'Test sent to this phone.';
  return `Test sent to ${sent} ${plural(sent, 'phone', 'phones')} on your account.`;
}

/* ------------------------------------------------------------------ */
/* Notification preferences                                            */
/* ------------------------------------------------------------------ */

export type PrefField = 'muted' | 'push';

/** A category from GET /meta: its order and label (who may read it comes from `inbox.<category>`). */
export type CategoryMeta = { value: NotificationCategory; label: string };

/** The fallback when GET /meta has not loaded: the brief's names. */
const FALLBACK_LABELS: Record<NotificationCategory, string> = {
  leads: 'Leads',
  sales: 'Sales',
  billing: 'Billing',
  clients: 'Clients',
  audience: 'Audience',
  team: 'Team',
  system: 'System',
};

/**
 * The rows to show, in the order GET /meta lists the categories (else the
 * brief's order), labelled from meta (else the server's row label). Only the
 * categories this person may read (`inbox.<category>`, see readableCategories
 * in src/modules/push/logic.ts), even if the server sent another row.
 */
export function prefRows(
  prefs: NotificationPrefs,
  meta: readonly CategoryMeta[] | undefined,
  readable: readonly NotificationCategory[],
): NotificationPref[] {
  const order: NotificationCategory[] = meta?.length ? meta.map((m) => m.value) : [...NOTIFICATION_CATEGORIES];
  for (const c of NOTIFICATION_CATEGORIES) if (!order.includes(c)) order.push(c);
  const rows: NotificationPref[] = [];
  for (const category of order) {
    const pref = prefs.find((p) => p.category === category);
    if (!pref) continue;
    if (!readable.includes(category)) continue;
    const label = meta?.find((m) => m.value === category)?.label || pref.label || FALLBACK_LABELS[category];
    rows.push({ ...pref, label });
  }
  return rows;
}

/** The optimistic change: one field of one category. */
export function setPrefField(prefs: NotificationPrefs, category: NotificationCategory, field: PrefField, value: boolean): NotificationPrefs {
  return prefs.map((p) => (p.category === category ? { ...p, [field]: value } : p));
}

/**
 * Undo one failed change, but only if nothing newer replaced it: a second tap
 * on the same switch while the first was saving owns the value now.
 */
export function revertPrefField(
  prefs: NotificationPrefs,
  category: NotificationCategory,
  field: PrefField,
  attempted: boolean,
  previous: boolean,
): NotificationPrefs {
  const current = prefs.find((p) => p.category === category);
  if (!current || current[field] !== attempted) return prefs;
  return setPrefField(prefs, category, field, previous);
}

/** Put the server's row in place of the cached one (the row keeps its place in the list). */
export function replacePref(prefs: NotificationPrefs, pref: NotificationPref): NotificationPrefs {
  return prefs.map((p) => (p.category === pref.category ? pref : p));
}

/* ------------------------------------------------------------------ */
/* The Kit easter egg (brief section 6)                                */
/* ------------------------------------------------------------------ */

/** Taps on the version that open the Kit. */
export const KIT_TAPS = 7;
/** From this tap on, each tap plays a countdown haptic. */
export const KIT_COUNTDOWN_FROM = 4;
/** A longer pause between taps starts the count again. */
export const KIT_TAP_WINDOW_MS = 1500;

export type KitTaps = { count: number; last: number };
export const KIT_TAPS_START: KitTaps = { count: 0, last: Number.NEGATIVE_INFINITY };

export type KitTapResult = {
  next: KitTaps;
  /** tap: nothing to show; countdown: play the countdown haptic; open: open the Kit. */
  event: 'tap' | 'countdown' | 'open';
  /** Taps still needed (0 when it opens). */
  remaining: number;
};

export function registerKitTap(taps: KitTaps, now: number): KitTapResult {
  const count = now - taps.last <= KIT_TAP_WINDOW_MS ? taps.count + 1 : 1;
  if (count >= KIT_TAPS) return { next: KIT_TAPS_START, event: 'open', remaining: 0 };
  return {
    next: { count, last: now },
    event: count >= KIT_COUNTDOWN_FROM ? 'countdown' : 'tap',
    remaining: KIT_TAPS - count,
  };
}
