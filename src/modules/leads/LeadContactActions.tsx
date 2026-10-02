import * as Clipboard from 'expo-clipboard';
import { Copy, Mail, MessageSquareText, Phone, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import type { Lead } from '@/api/schemas/leads';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { ActionSheet } from '@/components/sheet/ActionSheet';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { formatPhone } from '@/lib/format';
import { notice } from '@/lib/notice';

import { contactLinks, copyTargets, leadTitle } from './logic';

const CIRCLE = 52;

async function copyText(value: string) {
  try {
    await Clipboard.setStringAsync(value);
    notice.ok('Copied.');
  } catch {
    notice.err('Could not copy that.');
  }
}

function openUrl(url: string, failure: string) {
  Linking.openURL(url).catch(() => notice.err(failure));
}

type ActionProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
  /** Why it is off (read by TalkBack). */
  disabledHint: string;
};

/** One round action with its label under it; dimmed when the lead has nothing to act on. */
function Action({ icon, label, onPress, disabled, accessibilityLabel, disabledHint }: ActionProps) {
  const { colors, isDark } = useTheme();
  const tint = isDark ? colors.goldMid : colors.goldDeep;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={disabled ? disabledHint : undefined}
      accessibilityState={{ disabled }}
      style={[styles.action, disabled ? styles.disabled : null]}
    >
      <View
        style={[
          styles.circle,
          disabled ? { backgroundColor: colors.surface, borderColor: colors.line } : { backgroundColor: colors.goldTint, borderColor: colors.goldTint },
        ]}
      >
        <Icon icon={icon} size={22} rawColor={disabled ? colors.ink4 : tint} strokeWidth={2} />
      </View>
      <Text variant="label" color={disabled ? 'ink4' : 'ink2'} numberOfLines={1} align="center">
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * One-tap contact (brief 8.6): Call (tel:), Email (mailto:), Text (sms:) and
 * Copy. Copy puts the email on the clipboard, or asks which one when the lead
 * also left a phone number. Without a phone number, Call and Text are dimmed.
 */
export function LeadContactActions({ lead }: { lead: Lead }) {
  const links = contactLinks(lead);
  const targets = copyTargets(lead);
  const [copyOpen, setCopyOpen] = useState(false);
  const phone = lead.phone ? formatPhone(lead.phone) : '';

  const copy = () => {
    if (targets.length > 1) setCopyOpen(true);
    else if (targets[0]) void copyText(targets[0].value);
  };

  return (
    <View style={styles.row}>
      <Action
        icon={Phone}
        label="Call"
        disabled={!links.call}
        onPress={() => links.call && openUrl(links.call, 'Could not open the phone app.')}
        accessibilityLabel={phone ? `Call ${phone}` : 'Call'}
        disabledHint="No phone number on this lead"
      />
      <Action
        icon={Mail}
        label="Email"
        disabled={!links.email}
        onPress={() => links.email && openUrl(links.email, 'Could not open the mail app.')}
        accessibilityLabel={`Email ${lead.email}`}
        disabledHint="No valid email on this lead"
      />
      <Action
        icon={MessageSquareText}
        label="Text"
        disabled={!links.text}
        onPress={() => links.text && openUrl(links.text, 'Could not open Messages.')}
        accessibilityLabel={phone ? `Text ${phone}` : 'Text'}
        disabledHint="No phone number on this lead"
      />
      <Action
        icon={Copy}
        label="Copy"
        disabled={targets.length === 0}
        onPress={copy}
        accessibilityLabel={targets.length > 1 ? 'Copy the email or phone number' : 'Copy the email'}
        disabledHint="Nothing to copy"
      />
      <ActionSheet
        visible={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copy"
        subtitle={leadTitle(lead)}
        items={targets.map((t) => ({
          label: t.kind === 'email' ? 'Copy email' : 'Copy phone number',
          hint: t.shown,
          icon: t.kind === 'email' ? Mail : Phone,
          onPress: () => void copyText(t.value),
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  action: { flex: 1, alignItems: 'center', gap: space[2], paddingVertical: space[1] },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
});
