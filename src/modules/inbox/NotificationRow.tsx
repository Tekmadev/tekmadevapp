import {
  AlertTriangle,
  Building2,
  CircleCheck,
  CreditCard,
  Mail,
  MailOpen,
  Receipt,
  RotateCcw,
  Shield,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedReaction, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { NotificationCategory, NotificationItem } from '@/api/schemas/notifications';
import { Badge } from '@/components/Badge';
import { Divider } from '@/components/Divider';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { enterPull } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space, type Tone } from '@/design/tokens';
import { InlineLoader } from '@/loader/InlineLoader';

import { INBOX_COPY, isOpenAction, metaLine, rowAccessibilityLabel, SEVERITY_TONES } from './logic';

export const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  leads: UserRound,
  sales: Receipt,
  billing: CreditCard,
  clients: Building2,
  audience: Mail,
  team: Shield,
  system: Wrench,
};

/** The row's icon: the category's, or AlertTriangle for anything critical. */
export const notificationIcon = (item: Pick<NotificationItem, 'category' | 'severity'>): LucideIcon =>
  item.severity === 'critical' ? AlertTriangle : CATEGORY_ICONS[item.category];

type SwipeAction = { label: string; icon: LucideIcon; tone: Tone; onAction: () => void };

export type NotificationRowProps = {
  item: NotificationItem;
  /** Hairline under the row (another row of the same day follows). */
  divider: boolean;
  /** Stagger position when the row is pulled into place on first load, or null for no enter animation. */
  enterIndex: number | null;
  /** Swipes and their TalkBack actions are writes: none while offline. */
  online: boolean;
  /** "Mark as handled" or "Reopen" is waiting for the server. */
  resolving: boolean;
  onPress: (item: NotificationItem) => void;
  onLongPress: (item: NotificationItem) => void;
  onToggleRead: (item: NotificationItem) => void;
  onToggleResolved: (item: NotificationItem) => void;
};

const LEADING = 40;
/** Text starts here (gutter + icon + gaps); the divider lines up with it. */
export const ROW_TEXT_INSET = layout.gutter + LEADING + space[1] + space[3];
/** Release past this share of the row width to fire a swipe action (same as ListRow). */
const SWIPE_FIRE = 0.4;

/**
 * One Inbox row: severity-tinted category icon, title (bold with a gold dot
 * when unread), "Needs action" and "Test" badges, two lines of body and the
 * meta line. Swipe right toggles read; swipe left (needs-action rows only)
 * marks it handled or reopens it. Long press opens the actions sheet.
 */
export function NotificationRow({
  item,
  divider,
  enterIndex,
  online,
  resolving,
  onPress,
  onLongPress,
  onToggleRead,
  onToggleResolved,
}: NotificationRowProps) {
  const { colors, tones } = useTheme();
  const swipeRef = useRef<SwipeableMethods>(null);
  const [width, setWidth] = useState(0);

  // FlashList recycles cells: a new row never shows the previous row's half-open swipe.
  useEffect(() => {
    swipeRef.current?.reset();
  }, [item.id]);

  const tone = SEVERITY_TONES[item.severity];
  const unread = !item.is_read;
  const openAction = isOpenAction(item);
  const meta = metaLine(item);

  const readAction: SwipeAction | undefined = online
    ? unread
      ? { label: INBOX_COPY.markRead, icon: MailOpen, tone: 'gold', onAction: () => onToggleRead(item) }
      : { label: INBOX_COPY.markUnread, icon: Mail, tone: 'neutral', onAction: () => onToggleRead(item) }
    : undefined;
  const resolveAction: SwipeAction | undefined =
    online && item.needs_action && !resolving
      ? openAction
        ? { label: INBOX_COPY.markHandled, icon: CircleCheck, tone: 'ok', onAction: () => onToggleResolved(item) }
        : { label: INBOX_COPY.reopen, icon: RotateCcw, tone: 'warn', onAction: () => onToggleResolved(item) }
      : undefined;

  const a11yActions = [
    readAction ? { name: 'read', label: readAction.label } : null,
    resolveAction ? { name: 'resolve', label: resolveAction.label } : null,
    { name: 'more', label: 'More actions' },
  ].filter((a): a is { name: string; label: string } => a !== null);

  const onA11yAction = (e: { nativeEvent: { actionName: string } }) => {
    switch (e.nativeEvent.actionName) {
      case 'read':
        readAction?.onAction();
        break;
      case 'resolve':
        resolveAction?.onAction();
        break;
      case 'more':
        onLongPress(item);
        break;
    }
  };

  const showBadges = openAction || item.is_test || resolving;

  const body = (
    <PressableScale
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      pressedScale={0.985}
      accessibilityLabel={rowAccessibilityLabel(item)}
      accessibilityHint={item.action_url ? 'Opens it' : 'Shows the details'}
      accessibilityActions={a11yActions}
      onAccessibilityAction={onA11yAction}
      style={[styles.row, { backgroundColor: colors.bg }]}
    >
      <View style={[styles.icon, { backgroundColor: tones[tone].bg }]}>
        <Icon icon={notificationIcon(item)} size={20} tone={tone} strokeWidth={item.severity === 'critical' ? 2.25 : 1.75} />
      </View>
      <View style={styles.texts}>
        <View style={styles.titleLine}>
          <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={2} style={styles.title}>
            {item.title}
          </Text>
          {unread ? <View style={[styles.dot, { backgroundColor: colors.gold }]} /> : null}
        </View>
        {showBadges ? (
          <View style={styles.badges}>
            {resolving ? <InlineLoader size={14} /> : null}
            {openAction ? <Badge label={INBOX_COPY.needsAction} tone="gold" /> : null}
            {item.is_test ? <Badge label={INBOX_COPY.test} tone="neutral" /> : null}
          </View>
        ) : null}
        {item.body ? (
          <Text variant="small" color="ink3" numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        <Text variant="caption" color="ink4" numberOfLines={2} style={styles.meta}>
          {meta}
        </Text>
      </View>
    </PressableScale>
  );

  const threshold = width > 0 ? width * SWIPE_FIRE : undefined;
  const fire = (direction: SwipeDirection) => {
    const action = direction === SwipeDirection.RIGHT ? readAction : resolveAction;
    swipeRef.current?.close();
    action?.onAction();
  };

  return (
    <Animated.View entering={enterIndex !== null ? enterPull(enterIndex) : undefined} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {readAction || resolveAction ? (
        <ReanimatedSwipeable
          ref={swipeRef}
          friction={1}
          overshootLeft={false}
          overshootRight={false}
          leftThreshold={threshold}
          rightThreshold={threshold}
          onSwipeableWillOpen={fire}
          renderLeftActions={
            readAction ? (_p, translation) => <ActionPanel action={readAction} side="left" width={width} translation={translation} /> : undefined
          }
          renderRightActions={
            resolveAction
              ? (_p, translation) => <ActionPanel action={resolveAction} side="right" width={width} translation={translation} />
              : undefined
          }
        >
          {body}
        </ReanimatedSwipeable>
      ) : (
        body
      )}
      {divider ? <Divider inset={ROW_TEXT_INSET} /> : null}
    </Animated.View>
  );
}

/**
 * What a swipe reveals, matching ListRow: the action's tone, icon and label,
 * locking in (haptic, icon grows, tint deepens) once the row passes the fire point.
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
  const tone = tones[action.tone];
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
    <View style={[styles.panel, { width, backgroundColor: colors.bg }]} importantForAccessibility="no-hide-descendants">
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    paddingHorizontal: layout.gutter,
    paddingVertical: space[3] + 2,
    minHeight: 72,
  },
  icon: {
    width: LEADING,
    height: LEADING,
    marginRight: space[1],
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 3 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  title: { flexShrink: 1 },
  // Centred on the first line of the title (22dp line height).
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[1] + 2, marginTop: 2, marginBottom: 1 },
  meta: { marginTop: 2 },
  panel: { height: '100%' },
  panelContent: { flex: 1, justifyContent: 'center', gap: space[1], paddingHorizontal: space[6] },
  panelLeft: { alignItems: 'flex-start' },
  panelRight: { alignItems: 'flex-end' },
});
