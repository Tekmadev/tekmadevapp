import * as Clipboard from 'expo-clipboard';
import { Copy } from 'lucide-react-native';
import { Fragment, type ReactNode } from 'react';
import { Linking, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { Divider } from './Divider';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { contactUrl } from './parts/logic';

export type KeyValueItem = {
  label: string;
  /** Missing values show "Not set" in a muted colour, never a made-up value. */
  value: string | null | undefined;
  /** Tap the value to copy it ("Copied."). */
  copyable?: boolean;
  /** Geist Mono (ids, codes, keys). */
  mono?: boolean;
  /** Tap to call or email; long press copies. */
  link?: 'phone' | 'email';
  /** Custom content instead of the value text (a Badge, a small control). */
  render?: ReactNode;
  /** Makes the row open something (details, an editor). */
  onPress?: () => void;
};

export type KeyValueProps = {
  items: readonly (KeyValueItem | null | false | undefined)[];
  /** inline: label left, value right (default). stacked: label above value, for long values. */
  layout?: 'inline' | 'stacked';
  /** Hairlines between rows (default true). */
  dividers?: boolean;
  /** Side padding of the rows (default 16; use 0 inside a padded Card). */
  inset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const MISSING = 'Not set';

async function copy(value: string) {
  try {
    await Clipboard.setStringAsync(value);
    notice.ok('Copied.');
  } catch {
    notice.err('Could not copy that.');
  }
}

/**
 * Label and value rows: the phone alternative to a wide detail table. Values
 * can be copied, and phone numbers and emails open the dialer or mail app.
 */
export function KeyValue({ items, layout: mode = 'inline', dividers = true, inset = layout.gutter, style, testID }: KeyValueProps) {
  const rows = items.filter((i): i is KeyValueItem => Boolean(i));
  return (
    <View testID={testID} style={style}>
      {rows.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          <KeyValueRow item={item} stacked={mode === 'stacked'} inset={inset} />
          {dividers && i < rows.length - 1 ? <Divider inset={inset} insetEnd={inset} /> : null}
        </Fragment>
      ))}
    </View>
  );
}

function KeyValueRow({ item, stacked, inset }: { item: KeyValueItem; stacked: boolean; inset: number }) {
  const { colors } = useTheme();
  const raw = item.value?.trim() ? item.value : null;
  const url = raw && item.link ? contactUrl(item.link, raw) : null;
  const canCopy = Boolean(raw && (item.copyable || item.link));

  // Tap: the row's own action, else call/email, else copy. Long press copies when tap does something else.
  let onPress = item.onPress;
  let onLongPress: (() => void) | undefined;
  if (raw) {
    const copyValue = () => void copy(raw);
    if (!onPress && url) onPress = () => void Linking.openURL(url).catch(copyValue);
    else if (!onPress && canCopy) onPress = copyValue;
    if (canCopy && onPress !== copyValue) onLongPress = copyValue;
  }

  const valueNode = item.render ?? (
    <View style={[styles.valueLine, stacked ? null : styles.valueRight]}>
      <Text
        variant={item.mono ? 'mono' : 'body'}
        color={raw ? undefined : 'ink4'}
        selectable={false}
        align={stacked ? 'left' : 'right'}
        style={[styles.valueText, url ? { color: colors.gold } : null]}
      >
        {raw ?? MISSING}
      </Text>
      {canCopy && !url ? <Icon icon={Copy} size={14} color="ink4" /> : null}
    </View>
  );

  const hint = url ? (item.link === 'phone' ? 'Calls this number. Long press to copy.' : 'Writes an email. Long press to copy.') : canCopy ? 'Copies the value' : undefined;

  const body = (
    <View style={[stacked ? styles.stacked : styles.inline, { paddingHorizontal: inset }]}>
      <Text variant="small" color="ink3" style={stacked ? null : styles.label}>
        {item.label}
      </Text>
      {valueNode}
    </View>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        pressedScale={0.99}
        accessibilityRole={url ? 'link' : 'button'}
        accessibilityLabel={`${item.label}, ${raw ?? MISSING}`}
        accessibilityHint={hint}
      >
        {body}
      </PressableScale>
    );
  }
  return (
    <View accessible accessibilityLabel={`${item.label}, ${raw ?? MISSING}`}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingVertical: space[3],
  },
  stacked: { minHeight: layout.minTouch, gap: space[1], paddingVertical: space[3] },
  label: { flexShrink: 0, maxWidth: '45%' },
  valueLine: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  valueRight: { flex: 1, justifyContent: 'flex-end' },
  valueText: { flexShrink: 1 },
});
