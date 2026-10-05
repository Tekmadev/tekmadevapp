import { Bell, Plus, Search, Share2, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, type ButtonVariant } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Fab } from '@/components/Fab';
import { HoldToConfirm } from '@/components/HoldToConfirm';
import { IconButton } from '@/components/IconButton';
import { PendingButton } from '@/components/PendingButton';
import { SubmitGroup } from '@/components/SubmitGroup';
import { SwitchRow } from '@/components/form/Switch';
import { space } from '@/design/tokens';
import { useConnectivity } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { Caption, Demo, Labeled, Wrap } from '../kitLayout';
import { delay, failAfter } from '../sampleData';

const VARIANTS: readonly { variant: ButtonVariant; label: string }[] = [
  { variant: 'primary', label: 'Save changes' },
  { variant: 'secondary', label: 'Cancel' },
  { variant: 'ghost', label: 'Not now' },
  { variant: 'destructive', label: 'Delete' },
  { variant: 'gold', label: 'Publish' },
];

export function ButtonsDemos() {
  const simulatedOffline = useConnectivity((s) => s.simulatedOffline);
  const setSimulatedOffline = useConnectivity((s) => s.setSimulatedOffline);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmFails, setConfirmFails] = useState(false);

  return (
    <>
      <Demo title="Variants" note="primary, secondary, ghost, destructive and gold (the rare hero action).">
        <Wrap>
          {VARIANTS.map((v) => (
            <Button key={v.variant} label={v.label} variant={v.variant} onPress={() => notice.ok(`${v.label} pressed.`)} />
          ))}
        </Wrap>
        <Wrap>
          <Button label="New client" icon={Plus} />
          <Button label="Share link" icon={Share2} variant="secondary" />
        </Wrap>
      </Demo>

      <Demo title="Sizes" note="md is 48dp; sm is 40dp and keeps a 48dp touch target.">
        <Wrap>
          {VARIANTS.map((v) => (
            <Button key={v.variant} label={v.label} variant={v.variant} size="sm" />
          ))}
        </Wrap>
        <Button label="Full width" fullWidth />
      </Demo>

      <Demo title="Disabled" note="40% opacity, no press feedback, read as disabled.">
        <Wrap>
          {VARIANTS.map((v) => (
            <Button key={v.variant} label={v.label} variant={v.variant} disabled />
          ))}
        </Wrap>
      </Demo>

      <Demo title="Pending in a submit group" note="Press one: only it spins, the others wait. Nothing is sent twice.">
        <SubmitGroup>
          <View style={styles.stack}>
            <PendingButton
              label="Save changes"
              pendingLabel="Saving"
              fullWidth
              offlineHint={false}
              onPress={async () => {
                await delay(2500);
                notice.ok('Saved. A version snapshot was recorded.');
              }}
            />
            <PendingButton
              label="Publish"
              pendingLabel="Publishing"
              variant="secondary"
              fullWidth
              offlineHint={false}
              onPress={async () => {
                await delay(2500);
                notice.ok('Published and live on the site.');
              }}
            />
            <PendingButton label="Fail on purpose" pendingLabel="Trying" variant="ghost" fullWidth onPress={() => failAfter(1500)} />
          </View>
        </SubmitGroup>
        <Caption>The failing one shows the API message as a notice and returns to idle.</Caption>
      </Demo>

      <Demo title="Offline" note="Network actions are disabled offline, with the hint under the button.">
        <SwitchRow
          label="Simulate offline"
          description="The whole app behaves as if the phone lost its connection."
          value={simulatedOffline}
          onValueChange={setSimulatedOffline}
        />
        <PendingButton label="Send invite" pendingLabel="Sending" fullWidth onPress={() => delay(1500)} />
        <PendingButton
          label="Copy link"
          variant="secondary"
          fullWidth
          requiresNetwork={false}
          onPress={() => notice.ok('Copied.')}
        />
        <Caption>Copy link is local, so it stays enabled offline.</Caption>
      </Demo>

      <Demo
        title="Icon buttons"
        note={Platform.select({
          ios: '48pt targets with a VoiceOver label. Plain, tonal, badges, disabled.',
          default: '48dp targets with a TalkBack label. Plain, tonal, badges, disabled.',
        })}
      >
        <Wrap gap={space[3]}>
          <Labeled label="plain">
            <IconButton icon={Search} accessibilityLabel="Search" onPress={() => notice.ok('Search pressed.')} />
          </Labeled>
          <Labeled label="tonal">
            <IconButton icon={Bell} variant="tonal" accessibilityLabel="Notifications" />
          </Labeled>
          <Labeled label="gold dot">
            <IconButton icon={Bell} accessibilityLabel="Notifications, unread" badge />
          </Labeled>
          <Labeled label="signal dot">
            <IconButton icon={Bell} accessibilityLabel="Notifications, critical" badge="signal" />
          </Labeled>
          <Labeled label="signal">
            <IconButton icon={Trash2} tone="signal" accessibilityLabel="Move to trash" />
          </Labeled>
          <Labeled label="disabled">
            <IconButton icon={Share2} accessibilityLabel="Share" disabled />
          </Labeled>
        </Wrap>
      </Demo>

      <Demo title="Floating action button" note="Normally pinned bottom right above the tab bar; shown in place here.">
        <Fab accessibilityLabel="Quick actions" onPress={() => notice.ok('Quick actions.')} style={styles.inlineFab} />
      </Demo>

      <Demo title="Hold to confirm" note="Press and hold 1.2s. Let go early to cancel. Completing fires a warning haptic.">
        <HoldToConfirm
          label="Hold to move to trash"
          pendingLabel="Moving to trash"
          onConfirm={async () => {
            await delay(1200);
            notice.ok('Moved to trash.');
          }}
        />
        <HoldToConfirm
          label="Hold to publish"
          pendingLabel="Publishing"
          tone="ink"
          onConfirm={async () => {
            await delay(1200);
            notice.ok('Published and live on the site.');
          }}
        />
        <HoldToConfirm label="Hold to delete" disabled onConfirm={() => undefined} />
      </Demo>

      <Demo title="Confirm sheet" note="Says exactly what will happen, then Hold to confirm. It closes itself on success.">
        <SwitchRow
          label="Make it fail"
          description="The sheet stays open and the error shows as a notice."
          value={confirmFails}
          onValueChange={setConfirmFails}
        />
        <Button label="Move to trash" variant="destructive" icon={Trash2} onPress={() => setConfirmOpen(true)} />
        <ConfirmSheet
          visible={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Move to trash?"
          message="Move Acme Plumbing to trash. Data is kept; the portal stops working for them."
          confirmLabel="Hold to move to trash"
          pendingLabel="Moving to trash"
          onConfirm={async () => {
            if (confirmFails) await failAfter(1200);
            await delay(1200);
            notice.ok('Moved to trash.');
          }}
        />
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[2] },
  inlineFab: { position: 'relative', right: 0, bottom: 0, alignSelf: 'flex-start' },
});
