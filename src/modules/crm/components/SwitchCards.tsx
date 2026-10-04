import { TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MESSAGES } from '@/api/errors';
import { CRM_SURFACES, type CrmMeta, type CrmSurface, type CrmSwitch, type CrmSwitches } from '@/api/schemas/crm';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Switch } from '@/components/form/Switch';
import { Icon } from '@/components/Icon';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import { useCrmSwitch } from '../hooks';
import { surfaceLabel, SWITCH_DESCRIPTIONS, switchBadge, switchWarning, VERIFY_FIRST, whenText } from '../logic';

type SwitchCardsProps = {
  switches: CrmSwitches;
  meta: Partial<CrmMeta> | undefined;
  /** Turning a switch on needs a verified connection. Turning off always works. */
  verified: boolean;
  online: boolean;
  now: Date;
  /** `crm.write`: the switches. Without it each card shows its state only. */
  canWrite: boolean;
};

/**
 * Outbound, Inbound and Nightly reconcile: one card each, with its badge (Off,
 * Running, or "On, not running" with the reason in red). Turning one on waits
 * for a verified connection; turning Outbound on asks HoldToConfirm, since it
 * queues every contact once. Without `crm.write` the cards keep their badge,
 * description and warnings, with no switch.
 */
export function SwitchCards({ switches, meta, verified, online, now, canWrite }: SwitchCardsProps) {
  const labelFor = (surface: CrmSurface) => surfaceLabel(meta, surface);
  const { pending, set } = useCrmSwitch(labelFor);
  const [confirmOutbound, setConfirmOutbound] = useState(false);

  const toggle = (surface: CrmSurface, next: boolean) => {
    if (surface === 'outbound' && next) {
      setConfirmOutbound(true);
      return;
    }
    // The switch shows its own pending thumb; a failure is a toast and the switch stays as it was.
    set(surface, next).catch((error: unknown) => reportSubmitError(error));
  };

  return (
    <View style={styles.list}>
      {CRM_SURFACES.map((surface) => (
        <SwitchCard
          key={surface}
          label={labelFor(surface)}
          description={SWITCH_DESCRIPTIONS[surface]}
          sw={switches[surface]}
          verified={verified}
          online={online}
          pending={pending === surface}
          locked={pending !== null && pending !== surface}
          now={now}
          canWrite={canWrite}
          onChange={(next) => toggle(surface, next)}
        />
      ))}
      {!online && canWrite ? (
        <Text variant="small" color="ink4">
          {MESSAGES.offline}
        </Text>
      ) : null}

      <ConfirmSheet
        visible={confirmOutbound}
        onClose={() => setConfirmOutbound(false)}
        title="Turn on Outbound?"
        message="Every existing contact is queued for its first push to the CRM, once. After that, new leads, subscribers, bookings and clients are pushed as they come in, and every unsubscribe becomes email DND."
        confirmLabel="Hold to turn on Outbound"
        pendingLabel="Turning on"
        tone="ink"
        onConfirm={() => set('outbound', true)}
      />
    </View>
  );
}

type SwitchCardProps = {
  label: string;
  description: string;
  sw: CrmSwitch;
  verified: boolean;
  online: boolean;
  pending: boolean;
  /** Another switch is saving: one change at a time. */
  locked: boolean;
  now: Date;
  canWrite: boolean;
  onChange: (next: boolean) => void;
};

function SwitchCard({ label, description, sw, verified, online, pending, locked, now, canWrite, onChange }: SwitchCardProps) {
  const badge = switchBadge(sw);
  const warning = switchWarning(sw);
  const needsVerify = !sw.on && !verified;
  const disabled = !online || needsVerify || locked;
  const lastRun = sw.lastRunAt ? whenText(sw.lastRunAt, now) : '';

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.titleBlock}>
          <Text variant="title">{label}</Text>
          <Badge label={badge.label} tone={badge.tone} dot style={styles.badge} />
        </View>
        {canWrite ? (
          <Switch
            value={sw.on}
            onValueChange={onChange}
            disabled={disabled}
            pending={pending}
            accessibilityLabel={`${label}, ${badge.label}`}
            accessibilityHint={needsVerify ? VERIFY_FIRST : description}
          />
        ) : null}
      </View>
      <Text variant="small" color="ink3">
        {description}
      </Text>
      {warning ? (
        <View style={styles.warning} accessible accessibilityLabel={`Warning: ${warning}`}>
          <Icon icon={TriangleAlert} size={16} tone="signal" />
          <Text variant="small" tone="signal" style={styles.warningText} importantForAccessibility="no">
            {warning}
          </Text>
        </View>
      ) : null}
      {needsVerify && canWrite ? (
        <Text variant="small" color="ink4">
          {VERIFY_FIRST}
        </Text>
      ) : null}
      {lastRun ? (
        <Text variant="small" color="ink4">
          {`Last ran ${lastRun}`}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
  card: { gap: space[2] },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  titleBlock: { flex: 1, gap: space[1], alignItems: 'flex-start' },
  badge: { alignSelf: 'flex-start' },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  warningText: { flex: 1 },
});
