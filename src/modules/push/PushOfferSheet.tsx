import { BellRing } from 'lucide-react-native';
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { useCapabilities } from '@/auth/permissions';
import { useSession } from '@/auth/session';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet';
import { SheetStoreContext } from '@/components/sheet/context';
import { topOpenEntry, type SheetEntry } from '@/components/sheet/sheetStore';
import { useSubmitGroup } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { storage } from '@/lib/storage';

import { PUSH_COPY, pushPitch, readableCategories, shouldOfferPush } from './logic';
import { askPermission } from './permission';
import { registerThisPhone } from './registration';
import { usePushState } from './store';

/** Set once the offer was shown on this install ("Not now", back and a swipe all count as an answer). */
const OFFERED_KEY = 'push.offered.v1';
/** A calm moment: Home has settled and the biometric offer (if any) is gone. */
const OFFER_DELAY_MS = 1200;

const noSubscribe = () => () => undefined;
const noEntries: readonly SheetEntry[] = [];
const getNoEntries = () => noEntries;

/** True while any sheet is open (the offer never lands on top of another sheet). */
function useAnySheetOpen(): boolean {
  const store = useContext(SheetStoreContext);
  const entries = useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.getSnapshot ?? getNoEntries, store?.getSnapshot ?? getNoEntries);
  return topOpenEntry(entries) !== undefined;
}

/**
 * "Get pushes for new leads and sales?" (brief section 9; "Get pushes for new
 * leads?" for someone who gets no Sales pushes): asked once per install, right
 * after a password sign-in (never on a cold start), after the biometric offer,
 * with nothing else on screen, and only while the system would still show its
 * prompt. "Turn on" shows the system prompt, then registers this phone.
 * Mounted by the push host.
 */
export function PushOfferSheet({ locked }: { locked: boolean }) {
  // Captured at mount, like the app lock: the signed-in area mounts right after the sign-in.
  const [freshSignIn] = useState(() => useSession.getState().justSignedIn);
  const justSignedIn = useSession((s) => s.justSignedIn);
  const permission = usePushState((s) => s.permission);
  const sheetOpen = useAnySheetOpen();
  const capabilities = useCapabilities();
  const pitch = pushPitch(readableCategories(capabilities));
  const [offered, setOffered] = useState(() => storage.getBoolean(OFFERED_KEY) === true);
  const [visible, setVisible] = useState(false);
  const ready = shouldOfferPush({ freshSignIn, offered, justSignedIn, locked, sheetOpen, permission });

  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(() => {
      storage.set(OFFERED_KEY, true);
      setOffered(true);
      setVisible(true);
    }, OFFER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  const close = () => setVisible(false);

  const turnOn = async () => {
    const next = await askPermission();
    if (next.status !== 'granted') {
      // Declined in the system prompt: a choice, not a failure. Settings can turn it on later.
      close();
      return;
    }
    await registerThisPhone();
    close();
    const { status, error } = usePushState.getState();
    if (status === 'registered') {
      haptics.success();
      notice.ok(PUSH_COPY.turnedOn);
    } else if (error) {
      haptics.error();
      notice.err(error.message);
    }
  };

  return (
    <Sheet visible={visible} onClose={close} title={pitch.title} footer={<OfferActions onTurnOn={turnOn} onNotNow={close} />}>
      <OfferBody body={pitch.body} />
    </Sheet>
  );
}

function OfferBody({ body }: { body: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: colors.goldTint }]}>
        <Icon icon={BellRing} size={24} color="gold" />
      </View>
      <Text variant="body" color="ink3" style={styles.flex}>
        {body}
      </Text>
    </View>
  );
}

/** Rendered inside the sheet, so "Not now" is disabled while the system prompt and setup run. */
function OfferActions({ onTurnOn, onNotNow }: { onTurnOn: () => Promise<void>; onNotNow: () => void }) {
  const { busy } = useSubmitGroup();
  return (
    <View style={styles.actions}>
      <PendingButton label={PUSH_COPY.turnOn} pendingLabel={PUSH_COPY.turningOn} requiresNetwork={false} fullWidth onPress={onTurnOn} />
      <Button label={PUSH_COPY.notNow} variant="ghost" fullWidth disabled={busy} onPress={onNotNow} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4], paddingBottom: space[2] },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  actions: { gap: space[2] },
});
