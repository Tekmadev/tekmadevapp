import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { notificationKeys, notificationQuery } from '@/api/endpoints/notifications';
import { ApiError, errorMessage } from '@/api/errors';
import type { NotificationItem } from '@/api/schemas/notifications';
import { useAppLock } from '@/auth/lock/lockStore';
import { useCan, useCapabilities } from '@/auth/permissions';
import { useMe, useSession } from '@/auth/session';
import { INBOX } from '@/lib/deeplinks';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { usePrefs } from '@/lib/prefs';
import { useLatestCallback } from '@/lib/useLatestCallback';
import { cachedRows } from '@/modules/inbox/cache';
import { isOpenAction } from '@/modules/inbox/logic';
import { destinationOf, openLink } from '@/modules/inbox/navigation';
import { NotificationDetailSheet } from '@/modules/inbox/NotificationDetailSheet';
import { inboxSummaryQuery } from '@/modules/inbox/queries';
import { useInboxActions } from '@/modules/inbox/useInboxActions';

import { ensureChannels } from './channels';
import { installForegroundHandler, installResponseListener, setPushAppLocked } from './foreground';
import { iconBadgeCount, pushRoute, retriesWhenOnline, rowIdOf, type PushPayload } from './logic';
import { PushOfferSheet } from './PushOfferSheet';
import { installPushSignOut, onDevicePushToken, registerThisPhone, resumeRegistration } from './registration';
import { usePushState, usePushTaps, takeTap } from './store';

// Sign-out removes this phone's /devices row first (best effort).
installPushSignOut();

/**
 * The LockGate's start-up rule (both mount in the signed-in layout at the same
 * time): locked on a cold start with a saved session and biometric unlock on,
 * not right after a password sign-in.
 */
const lockedAtStart = () => usePrefs.getState().biometricUnlock && !useSession.getState().justSignedIn;

/** Whether the app lock is up right now, read the way the LockGate reads it. */
const lockIsUp = (atStart: boolean) => usePrefs.getState().biometricUnlock && (useAppLock.getState().locked ?? atStart);

/** The app is in front (iOS "inactive" and Android "background" are on their way in or out). */
const appInFront = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';

/**
 * iOS: the app icon badge follows the bell's unread count (the server's pushes
 * carry no badge, so nothing else would ever set or clear it), and goes back to
 * none on sign-out. Reads the summary the bell already polls; never fetches.
 * Android launchers badge the notifications in the shade themselves.
 */
function useIosIconBadge() {
  const canView = useCan('notifications.view');
  const unread = useQuery({ ...inboxSummaryQuery(), enabled: false, select: (summary) => summary.unread }).data;
  const count = iconBadgeCount(unread, canView);
  useEffect(() => {
    if (Platform.OS !== 'ios' || count === null) return;
    Notifications.setBadgeCountAsync(count).catch(() => undefined);
  }, [count]);
  useEffect(
    () => () => {
      if (Platform.OS === 'ios') Notifications.setBadgeCountAsync(0).catch(() => undefined);
    },
    [],
  );
}

function useAppLocked(): { locked: boolean; atStart: boolean } {
  const [atStart] = useState(lockedAtStart);
  const stored = useAppLock((s) => s.locked);
  const enabled = usePrefs((s) => s.biometricUnlock);
  return { locked: enabled && (stored ?? atStart), atStart };
}

/**
 * Push notifications for the signed-in area (brief section 9). Mount once in
 * the signed-in layout. It creates the Android channels, shows pushes that
 * arrive while the app is open as toasts, registers this phone (and again when
 * the token, the app version or the permission changes), and opens tapped
 * pushes: marked read, then the mapped screen, held while the app is locked.
 * A push with no link (or a link this person may not open) opens the Inbox
 * with the row's detail sheet. It also asks once, after sign-in, to turn push
 * on. The Android channels follow the categories the person may read.
 */
export function PushHost() {
  const qc = useQueryClient();
  const me = useMe();
  const capabilities = useCapabilities();
  const pathname = usePathname();
  const online = useIsOnline();
  const actions = useInboxActions();
  const { locked, atStart } = useAppLocked();
  const pending = usePushTaps((s) => s.pending);
  const [detail, setDetail] = useState<{ id: string; open: boolean } | null>(null);
  useIosIconBadge();

  useEffect(() => {
    setPushAppLocked(locked);
  }, [locked]);

  // Start: channels, the foreground handler, taps (cold start and warm), token changes, registration.
  useEffect(() => {
    resumeRegistration();
    const removeHandler = installForegroundHandler();
    const removeResponses = installResponseListener();
    const tokens = Notifications.addPushTokenListener(onDevicePushToken);
    void registerThisPhone();
    // Back from the system settings (permission turned on) or a new app version: register if needed.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void registerThisPhone();
    });
    return () => {
      removeHandler();
      removeResponses();
      tokens.remove();
      appState.remove();
      setPushAppLocked(false);
    };
  }, []);

  // The channels for the categories this person may read, again whenever their capabilities change.
  useEffect(() => {
    void ensureChannels();
  }, [capabilities]);

  // Setup failed for want of a connection: try again by itself once back online.
  useEffect(() => {
    if (!online) return;
    const { status, error } = usePushState.getState();
    if (status === 'failed' && retriesWhenOnline(error)) void registerThisPhone();
  }, [online]);

  /** The row's detail sheet over the Inbox: from the cache at once, then fresh from the server. */
  const showDetail = (id: string) => {
    const cached = qc.getQueryData<NotificationItem>(notificationKeys.detail(id)) ?? cachedRows(qc, (item) => item.id === id)[0];
    if (cached) {
      qc.setQueryData(notificationKeys.detail(id), cached);
      setDetail({ id, open: true });
    } else {
      // The same row closed earlier: forget it, so the answer below opens it again.
      setDetail((d) => (d?.id === id && !d.open ? null : d));
    }
    // Offline with nothing cached: the Inbox already says it is offline.
    if (!online) return;
    qc.fetchQuery(notificationQuery(id)).then(
      // Opens it if the cache had nothing; never reopens a sheet the person already closed.
      () => setDetail((d) => (d?.id === id ? d : { id, open: true })),
      (error: unknown) => {
        if (cached || !(error instanceof ApiError) || error.isNetwork || error.kind === 'aborted') return;
        notice.err(errorMessage(error));
      },
    );
  };

  const openTap = useLatestCallback((payload: PushPayload) => {
    const id = rowIdOf(payload);
    // Like a row tap in the Inbox: read at once (optimistic), only when the write can go out.
    if (id && online) actions.markRead([id]);
    const route = pushRoute(payload, me);
    if (route.kind === 'screen') {
      openLink(route.link);
      return;
    }
    if (pathname === INBOX.pathname) {
      // Already in the Inbox: switch its segment instead of stacking a second Inbox.
      if (route.link.params) router.setParams(route.link.params);
    } else {
      openLink(route.link);
    }
    if (route.detailId) showDetail(route.detailId);
  });

  // Open a waiting tap once the app is in front and unlocked (signed out, this host is not even mounted).
  useEffect(() => {
    if (!pending || locked) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Next tick, after everything reacting to the same moment: on a cold start the navigator mounts
    // in this commit, and on the way back from the background the app lock decides (in its own
    // AppState listener) whether it is up. A tap that arrives before the app is in front waits for it.
    const openSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!appInFront() || lockIsUp(atStart)) return;
        if (takeTap(pending.key)) openTap(pending.payload);
      }, 0);
    };
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') openSoon();
    });
    if (appInFront()) openSoon();
    return () => {
      clearTimeout(timer);
      appState.remove();
    };
  }, [pending, locked, atStart, openTap]);

  const closeDetail = () => setDetail((d) => (d ? { ...d, open: false } : d));

  return (
    <>
      <NotificationDetailSheet
        id={detail?.id ?? null}
        visible={detail?.open ?? false}
        onClose={closeDetail}
        online={online}
        canOpen={(item) => destinationOf(item, me) !== null}
        onOpen={(item) => {
          closeDetail();
          const destination = destinationOf(item, me);
          if (destination) openLink(destination);
        }}
        onToggleResolved={(item) => actions.setResolved(item.id, isOpenAction(item))}
        onMarkUnread={(item) => {
          closeDetail();
          actions.markUnread([item.id]);
        }}
      />
      <PushOfferSheet locked={locked} />
    </>
  );
}
