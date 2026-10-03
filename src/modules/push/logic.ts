import {
  NOTIFICATION_CATEGORIES,
  zNotificationCategory,
  zNotificationSeverity,
  type NotificationCategory,
  type NotificationSeverity,
} from '@/api/schemas/notifications';
import type { Role } from '@/api/types';
import { INBOX, mapAdminUrl, type AppLink } from '@/lib/deeplinks';
import { CATEGORY_LABELS } from '@/modules/inbox/logic';

/**
 * Push rules that need no device (brief section 9): copy, the Android
 * channels, reading a push's data, where a tap goes, what a push does while
 * the app is open, and when this phone must register again. Unit tested in
 * __tests__/logic.test.ts. Everything that touches expo-notifications lives
 * next to this file.
 */

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

export const PUSH_COPY = {
  offerTitle: 'Get pushes for new leads and sales?',
  offerBody: 'Your phone tells you the moment a lead, a sale or a problem comes in. Pick the categories in Settings, Notifications.',
  turnOn: 'Turn on',
  turningOn: 'Turning on',
  notNow: 'Not now',
  turnedOn: 'Push is on for this phone.',
  off: 'Push is off on this phone',
  offHelp: 'Allow notifications to get a push for new leads, sales and problems. The Inbox keeps everything either way.',
  askHint: 'Asks to allow notifications',
  settingsHint: 'Opens this app in your phone settings',
  settingUp: 'Setting up push on this phone',
  settingUpHelp: 'This takes a moment.',
  on: 'Push is on for this phone',
  onHelp: 'Choose which categories push above.',
  failed: 'Push is not set up on this phone',
  tryAgain: 'Try again',
  retrying: 'Setting up',
  details: 'Details',
  open: 'Open',
  fallbackTitle: 'New notification',
  mockLocalTest: 'Mock API: this phone also shows a local test now, in the shade and here.',
} as const;

/* ------------------------------------------------------------------ */
/* Android channels                                                    */
/* ------------------------------------------------------------------ */

/** The brand gold (the notification accent in app.json), used for the channel light. */
export const PUSH_GOLD = '#c89c65';

export type PushChannel = {
  id: string;
  name: string;
  description: string;
  category: NotificationCategory;
  /** The high-importance variant: heads-up on screen. */
  critical: boolean;
};

const CHANNEL_DESCRIPTIONS: Record<NotificationCategory, string> = {
  leads: 'New leads, bookings and free tool submissions.',
  sales: 'New orders, subscriptions and coupon use.',
  billing: 'Payments, cancellations, refunds and disputes.',
  clients: 'Onboarding, intake, access, approvals and files.',
  audience: 'Email subscribers, bounces and spam reports.',
  team: 'People added to or removed from the team.',
  system: 'Webhooks, syncs and other problems worth a look.',
};

const CRITICAL_SUFFIX = '-critical';

/** The channel a push uses: the category's, or its critical variant ("billing-critical"). */
export function channelIdFor(category: NotificationCategory, severity: NotificationSeverity): string {
  return severity === 'critical' ? `${category}${CRITICAL_SUFFIX}` : category;
}

/** One channel per category plus a critical variant each: 14 channels, in the brief's order. */
export const PUSH_CHANNELS: readonly PushChannel[] = NOTIFICATION_CATEGORIES.flatMap((category) => [
  {
    id: channelIdFor(category, 'info'),
    name: CATEGORY_LABELS[category],
    description: CHANNEL_DESCRIPTIONS[category],
    category,
    critical: false,
  },
  {
    id: channelIdFor(category, 'critical'),
    name: `${CATEGORY_LABELS[category]} (critical)`,
    description: 'Only the critical ones. They show at the top of the screen.',
    category,
    critical: true,
  },
]);

/* ------------------------------------------------------------------ */
/* Payload                                                             */
/* ------------------------------------------------------------------ */

/** `notificationId` of a test push (POST /notifications/test-push): there is no Inbox row behind it. */
export const TEST_NOTIFICATION_ID = 'test';

/** The identifier of the local test notification (mock API mode). A second test replaces the first. */
export const LOCAL_TEST_IDENTIFIER = 'tekmadev-push-test';

export type PushPayload = {
  /** The Inbox row's id, "test" for a test push, or null when missing. */
  notificationId: string | null;
  /** A web admin path (action_url), or null. */
  url: string | null;
  category: NotificationCategory;
  severity: NotificationSeverity;
};

const asText = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/**
 * Read a push's `data` ({ notificationId, url, category, severity }). Lenient:
 * an unknown category reads as System and an unknown severity as info, so a
 * newer server never breaks the tap. Null when it is not one of ours (no id
 * and no link).
 */
export function parsePushPayload(data: unknown): PushPayload | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const notificationId = asText(record.notificationId);
  const url = asText(record.url);
  if (notificationId === null && url === null) return null;
  const category = zNotificationCategory.safeParse(record.category);
  const severity = zNotificationSeverity.safeParse(record.severity);
  return {
    notificationId,
    url,
    category: category.success ? category.data : 'system',
    severity: severity.success ? severity.data : 'info',
  };
}

/** The Inbox row behind a push, or null (a test push, or no id). */
export function rowIdOf(payload: PushPayload): string | null {
  const id = payload.notificationId;
  return id && id !== TEST_NOTIFICATION_ID ? id : null;
}

/* ------------------------------------------------------------------ */
/* Tap routing                                                         */
/* ------------------------------------------------------------------ */

export type PushRoute =
  /** A screen other than the Inbox (a client, Leads, Analytics...). */
  | { kind: 'screen'; link: AppLink }
  /** The Inbox (with its filter, if the link had one), plus the row's detail sheet when there is a row. */
  | { kind: 'inbox'; link: AppLink; detailId: string | null };

/**
 * Where a tap goes (brief sections 7 and 9). The link is mapped for this
 * role; a missing, unknown or forbidden link opens the Inbox with the row's
 * detail sheet, like tapping a row without a destination in the Inbox.
 */
export function pushRoute(payload: PushPayload, role: Role | null): PushRoute {
  const link = payload.url ? mapAdminUrl(payload.url, role) : INBOX;
  if (link.pathname !== INBOX.pathname) return { kind: 'screen', link };
  return { kind: 'inbox', link, detailId: rowIdOf(payload) };
}

/** Each tap (or toast "Open") is handled once: identifier, delivery time and action. */
export function responseKey(identifier: string, date: number, action: string): string {
  return `${identifier}|${date}|${action}`;
}

/**
 * How many handled tap keys this phone remembers. Kept on disk, because
 * Android hands the launch tap over again when the app is reopened from Recents
 * after the system closed it in the background.
 */
export const HANDLED_TAPS_KEPT = 30;

/** The remembered tap keys once `key` is handled: newest last, no repeats, at most `max`. */
export function rememberTap(keys: readonly string[], key: string, max: number = HANDLED_TAPS_KEPT): string[] {
  return [...keys.filter((k) => k !== key), key].slice(-max);
}

/* ------------------------------------------------------------------ */
/* Foreground                                                          */
/* ------------------------------------------------------------------ */

export type ForegroundBehavior = {
  /** System banner and shade entry. */
  system: boolean;
  /** The in-app toast. */
  toast: boolean;
};

/**
 * A push that arrives while the app is open shows a toast instead of a system
 * notification (brief section 9). Two exceptions: while the app lock is up
 * the toast would be hidden, so the system shows it; and the mock API's local
 * test shows both, so the channel, icon and toast can all be checked at once.
 */
export function foregroundBehavior(options: { locked: boolean; localTest: boolean }): ForegroundBehavior {
  if (options.locked) return { system: true, toast: false };
  if (options.localTest) return { system: true, toast: true };
  return { system: false, toast: true };
}

/** The toast text: the title, then the body on its own line. */
export function toastMessage(title: string | null | undefined, body: string | null | undefined): string {
  const t = title?.trim() ?? '';
  const b = body?.trim() ?? '';
  if (t && b) return `${t}\n${b}`;
  return t || b || PUSH_COPY.fallbackTitle;
}

/** Critical pushes use the error toast (signal border and alert icon); everything else the ok toast. */
export function toastTone(severity: NotificationSeverity): 'ok' | 'err' {
  return severity === 'critical' ? 'err' : 'ok';
}

/* ------------------------------------------------------------------ */
/* Permission                                                          */
/* ------------------------------------------------------------------ */

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
export type PermissionSnapshot = { status: PermissionStatus; canAskAgain: boolean };

/** What "Turn on" does: nothing (already on), ask the system, or open the app's system settings. */
export function permissionAction(permission: PermissionSnapshot): 'none' | 'ask' | 'settings' {
  if (permission.status === 'granted') return 'none';
  return permission.canAskAgain ? 'ask' : 'settings';
}

/**
 * The one-time "Get pushes for new leads and sales?" sheet: only right after
 * a password sign-in (never on a cold start), once per install, once the
 * biometric offer is answered, with nothing else on screen, and only while the
 * system would still ask. (Android 13 and newer report "denied" before the
 * first prompt, because notifications stay off until it is granted, so the
 * test is "would the system ask", not "undetermined".)
 */
export function shouldOfferPush(state: {
  freshSignIn: boolean;
  offered: boolean;
  /** The biometric offer has not been answered yet. */
  justSignedIn: boolean;
  locked: boolean;
  sheetOpen: boolean;
  permission: PermissionSnapshot | null;
}): boolean {
  if (!state.freshSignIn || state.offered || state.justSignedIn || state.locked || state.sheetOpen) return false;
  return state.permission !== null && permissionAction(state.permission) === 'ask';
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export type PushRegistration = {
  deviceId: string;
  token: string;
  userId: string;
  appVersion: string;
  platform: string;
  /** ms since epoch. */
  registeredAt: number;
};

/** Register again after a week, so the server's "last seen" stays fresh and a pruned row comes back. */
export const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** A stored registration, or null when it is missing or malformed. */
export function parseRegistration(raw: unknown): PushRegistration | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  const deviceId = text(r.deviceId);
  const token = text(r.token);
  const userId = text(r.userId);
  const appVersion = text(r.appVersion);
  const platform = text(r.platform);
  const registeredAt = typeof r.registeredAt === 'number' && Number.isFinite(r.registeredAt) ? r.registeredAt : null;
  if (!deviceId || !token || !userId || !appVersion || !platform || registeredAt === null) return null;
  return { deviceId, token, userId, appVersion, platform, registeredAt };
}

type Current = { userId: string; appVersion: string; platform: string; now: number };

/**
 * Is the stored registration still good, without asking for a token? Same
 * person, same app version and platform, registered within the last week (a
 * clock that moved backwards counts as stale).
 */
export function registrationIsCurrent(record: PushRegistration | null, current: Current): record is PushRegistration {
  if (!record) return false;
  if (record.userId !== current.userId || record.appVersion !== current.appVersion || record.platform !== current.platform) return false;
  const age = current.now - record.registeredAt;
  return age >= 0 && age < REREGISTER_AFTER_MS;
}

/** With a fresh token in hand: does the server need POST /devices? (Also when the token changed.) */
export function needsRegistration(record: PushRegistration | null, current: Current & { token: string }): boolean {
  return !registrationIsCurrent(record, current) || record.token !== current.token;
}

/** What makes two POST /devices the same intent (a retry reuses its Idempotency-Key). */
export function registrationSignature(current: { userId: string; token: string; appVersion: string; platform: string }): string {
  return [current.userId, current.token, current.appVersion, current.platform].join('|');
}

/** The name sent with POST /devices: the phone's own name, else its model, at most 80 characters. */
export function deviceLabel(deviceName: string | null | undefined, modelName: string | null | undefined): string {
  const pick = [deviceName, modelName].map((v) => v?.trim() ?? '').find((v) => v.length > 0) ?? '';
  return Array.from(pick).slice(0, 80).join('');
}

/* ------------------------------------------------------------------ */
/* Setup errors                                                        */
/* ------------------------------------------------------------------ */

export type SetupError = { message: string; detail: string | null };

export const SETUP_MESSAGES = {
  offline: 'This phone is offline. Push is set up as soon as it is back online.',
  network: 'Could not reach the push service. Check your connection, then try again.',
  token: 'This phone could not get a push token. Try again in a moment.',
  service: 'The push service did not answer. Try again in a moment.',
  project: 'This build has no push project. A new build fixes it.',
  generic: 'Push could not be set up on this phone. Try again in a moment.',
} as const;

const codeOf = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error as { code: unknown };
  return typeof code === 'string' ? code : null;
};

/** A short technical reason for the owner (shown small under the message). */
function detailOf(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null;
  const text = message?.replace(/\s+/g, ' ').trim();
  if (!text) return codeOf(error);
  return Array.from(text).length > 160 ? `${Array.from(text).slice(0, 159).join('')}…` : text;
}

/** Why the push token could not be had, in plain words (a failed token never crashes anything). */
export function tokenErrorMessage(error: unknown, online: boolean): SetupError {
  if (!online) return { message: SETUP_MESSAGES.offline, detail: null };
  const code = codeOf(error);
  const detail = detailOf(error);
  switch (code) {
    case 'ERR_NOTIFICATIONS_NETWORK_ERROR':
      return { message: SETUP_MESSAGES.network, detail };
    case 'E_REGISTRATION_FAILED':
      return { message: SETUP_MESSAGES.token, detail };
    case 'ERR_NOTIFICATIONS_SERVER_ERROR':
      return { message: SETUP_MESSAGES.service, detail };
    case 'ERR_NOTIFICATIONS_NO_EXPERIENCE_ID':
    case 'ERR_NOTIFICATIONS_NO_APPLICATION_ID':
      return { message: SETUP_MESSAGES.project, detail };
    default:
      return { message: SETUP_MESSAGES.generic, detail };
  }
}

/** Retry by itself when the connection comes back (not after a server refusal or a broken build). */
export function retriesWhenOnline(error: SetupError | null): boolean {
  return error !== null && (error.message === SETUP_MESSAGES.offline || error.message === SETUP_MESSAGES.network);
}
