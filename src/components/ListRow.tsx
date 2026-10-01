import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedReaction, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { layout, radius, space, type Tone } from '@/design/tokens';

import { Avatar } from './Avatar';
import { Badge, type BadgeProps } from './Badge';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type SwipeAction = {
  /** Always shown under the icon, and read by TalkBack as a custom action. */
  label: string;
  icon: LucideIcon;
  tone?: Tone;
  onAction: () => void;
};

export type ListRowProps = {
  title: string;
  /** Bold title and a gold dot (Inbox). */
  unread?: boolean;
  subtitle?: string;
  subtitleLines?: number;
  /** A quieter third line (time, owner, source). */
  meta?: string;

  /** Icon in a tinted circle. */
  icon?: LucideIcon;
  iconTone?: Tone;
  /** Or an avatar (photo with an initial fallback). */
  avatar?: { name?: string | null; uri?: string | null };
  /** Or anything else; wins over icon and avatar. */
  leading?: ReactNode;

  /** Text on the right in tabular figures ("$77.50", "3d late"). */
  value?: string;
  valueTone?: Tone;
  /** A status badge on the right (under the value when both are set). */
  badge?: BadgeProps;
  /** Anything else on the right; wins over value and badge. */
  trailing?: ReactNode;
  /** Default: shown when the row has onPress. */
  chevron?: boolean;

  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;

  /** Revealed by swiping right; fires on release past 40% of the row. */
  leftAction?: SwipeAction;
  /** Revealed by swiping left. */
  rightAction?: SwipeAction;
  /** The item's id. FlashList recycles rows: a new id closes any half-open swipe. */
  itemKey?: string | number;

  /** Row background. Swipe actions need one; use "surface" inside a Card. */
  background?: 'bg' | 'surface' | 'none';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const LEADING = 40;
/** Release past this share of the row width to fire a swipe action. */
const SWIPE_FIRE = 0.4;

/**
 * The standard list row: leading icon or avatar, title, subtitle and meta,
 * trailing value or badge, chevron. Optional swipe actions fire on a long
 * swipe with a haptic as the action locks in, then the row springs back.
 */
export function ListRow(props: ListRowProps) {
  const { leftAction, rightAction, itemKey, background, style, testID } = props;
  const { colors } = useTheme();
  const swipeRef = useRef<SwipeableMethods>(null);
  const [width, setWidth] = useState(0);
  const hasSwipe = Boolean(leftAction || rightAction);
  const bg = (background ?? (hasSwipe ? 'bg' : 'none')) === 'none' ? undefined : colors[background === 'surface' ? 'surface' : 'bg'];

  // Recycled cell, new item: never show the previous item's half-open swipe.
  useEffect(() => {
    swipeRef.current?.reset();
  }, [itemKey]);

  const body = <RowBody {...props} backgroundColor={bg} />;
  if (!hasSwipe) {
    return (
      <View testID={testID} style={style}>
        {body}
      </View>
    );
  }

  const threshold = width > 0 ? width * SWIPE_FIRE : undefined;
  const fire = (direction: SwipeDirection) => {
    const action = direction === SwipeDirection.RIGHT ? leftAction : rightAction;
    swipeRef.current?.close();
    action?.onAction();
  };

  return (
    <View testID={testID} style={style} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={1}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={threshold}
        rightThreshold={threshold}
        onSwipeableWillOpen={fire}
        renderLeftActions={
          leftAction
            ? (_progress, translation) => <ActionPanel action={leftAction} side="left" width={width} translation={translation} />
            : undefined
        }
        renderRightActions={
          rightAction
            ? (_progress, translation) => <ActionPanel action={rightAction} side="right" width={width} translation={translation} />
            : undefined
        }
      >
        {body}
      </ReanimatedSwipeable>
    </View>
  );
}

function RowBody({
  title,
  unread = false,
  subtitle,
  subtitleLines = 1,
  meta,
  icon,
  iconTone = 'neutral',
  avatar,
  leading,
  value,
  valueTone,
  badge,
  trailing,
  chevron,
  onPress,
  onLongPress,
  disabled,
  leftAction,
  rightAction,
  accessibilityLabel,
  accessibilityHint,
  backgroundColor,
}: ListRowProps & { backgroundColor?: string }) {
  const { colors, tones } = useTheme();
  const showChevron = chevron ?? Boolean(onPress);

  const lead =
    leading ??
    (avatar ? (
      <Avatar name={avatar.name} uri={avatar.uri} size={LEADING} />
    ) : icon ? (
      <View style={[styles.iconCircle, { backgroundColor: tones[iconTone].bg }]}>
        <Icon icon={icon} size={20} tone={iconTone} />
      </View>
    ) : null);

  const right =
    trailing ??
    (value || badge ? (
      <View style={styles.trailing}>
        {value ? (
          <Text variant="bodyStrong" tone={valueTone} tabular numberOfLines={1} align="right">
            {value}
          </Text>
        ) : null}
        {badge ? <Badge {...badge} /> : null}
      </View>
    ) : null);

  const label =
    accessibilityLabel ?? [title, unread ? 'unread' : null, subtitle, meta, value, badge?.label].filter(Boolean).join(', ');

  const actions = [leftAction, rightAction].filter((a): a is SwipeAction => Boolean(a));
  const a11yActions = actions.map((a) => ({ name: a.label, label: a.label }));
  const onA11yAction = (e: { nativeEvent: { actionName: string } }) => {
    actions.find((a) => a.label === e.nativeEvent.actionName)?.onAction();
  };

  const content = (
    <View style={[styles.row, { backgroundColor }]}>
      {lead ? <View style={styles.leading}>{lead}</View> : null}
      <View style={styles.texts}>
        <View style={styles.titleLine}>
          <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {unread ? <View style={[styles.unreadDot, { backgroundColor: colors.gold }]} /> : null}
        </View>
        {subtitle ? (
          <Text variant="small" color="ink3" numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" color="ink4" numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron ? <Icon icon={ChevronRight} size={18} color="ink4" /> : null}
    </View>
  );

  if (onPress || onLongPress) {
    return (
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        pressedScale={0.985}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: Boolean(disabled) }}
        accessibilityActions={a11yActions.length ? a11yActions : undefined}
        onAccessibilityAction={a11yActions.length ? onA11yAction : undefined}
      >
        {content}
      </PressableScale>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityActions={a11yActions.length ? a11yActions : undefined}
      onAccessibilityAction={a11yActions.length ? onA11yAction : undefined}
    >
      {content}
    </View>
  );
}

/**
 * What a swipe reveals: the action's tone, icon and label. It locks in (haptic,
 * icon grows, colour deepens) once the row passes the fire point.
 */
function ActionPanel({
  action,
  side,
  width,
  translation,
}: {
  action: SwipeAction;
  side: 'left' | 'right';
  width: number;
  translation: SharedValue<number>;
}) {
  const { colors, tones } = useTheme();
  const tone = tones[action.tone ?? 'neutral'];
  const fireAt = width * SWIPE_FIRE;

  const armed = useDerivedValue(() => (width > 0 && Math.abs(translation.get()) >= fireAt ? 1 : 0));
  useAnimatedReaction(
    () => armed.get(),
    (now, prev) => {
      if (prev !== null && now === 1 && prev === 0) scheduleOnRN(haptics.medium);
    },
  );

  const tintStyle = useAnimatedStyle(() => ({ opacity: 0.55 + armed.get() * 0.45 }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + armed.get() * 0.2 }] }));

  return (
    <View style={[styles.panel, { width, backgroundColor: colors.bg }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tone.bg }, tintStyle]} />
      <View style={[styles.panelContent, side === 'left' ? styles.panelLeft : styles.panelRight]}>
        <Animated.View style={iconStyle}>
          <Icon icon={action.icon} size={22} rawColor={tone.text} strokeWidth={2} />
        </Animated.View>
        <Text variant="caption" weight="600" style={{ color: tone.text }}>
          {action.label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: layout.gutter,
    paddingVertical: space[3],
  },
  leading: { marginRight: space[1] },
  iconCircle: {
    width: LEADING,
    height: LEADING,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  title: { flexShrink: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { marginTop: 2 },
  trailing: { alignItems: 'flex-end', gap: space[1], maxWidth: '45%' },
  panel: { height: '100%' },
  panelContent: { flex: 1, justifyContent: 'center', gap: space[1], paddingHorizontal: space[6] },
  panelLeft: { alignItems: 'flex-start' },
  panelRight: { alignItems: 'flex-end' },
});
