import { EyeOff, Send, Sparkles, Star, Trash2, type LucideIcon } from 'lucide-react-native';
import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedReaction, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { BlogMeta, PostRow as Row } from '@/api/schemas/blog';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, space, type Tone } from '@/design/tokens';

import { postSwipeActions, rowMetaLine, rowSpokenLabel, statusBadge, type PostAccess } from './logic';

type SwipeAction = { label: string; icon: LucideIcon; tone: Tone; onAction: () => void };

export type PostRowProps = {
  row: Row;
  meta: BlogMeta | undefined;
  now: Date;
  /** Swipes and their TalkBack actions are writes: none while offline. */
  online: boolean;
  /** `blog.write` (publish swipe, the editor) and `blog.trash` (trash swipe). Staff get neither: no swipes. */
  access: PostAccess;
  /** Position in the list: the first rows are pulled into place with a stagger. */
  index: number;
  /** No enter animation (reduced motion, or rows that arrive with a later page). */
  still: boolean;
  onPress: (row: Row) => void;
  /** The actions sheet (Edit or Open, Publish, View live, Share link, Move to trash: what `access` allows). */
  onMore: (row: Row) => void;
  onTogglePublish: (row: Row) => void;
  onTrash: (row: Row) => void;
};

/** Release past this share of the row width to fire a swipe action (same as ListRow). */
const SWIPE_FIRE = 0.4;

/**
 * One post on the Blog list (brief 8.11): title, then the status, "Featured"
 * and "AI draft" badges, then category, author and the update time. Tap opens
 * the editor. Swipe right publishes or unpublishes, swipe left moves it to the
 * trash (both confirm with a hold). Long press opens every action. Without
 * `blog.write` the tap opens the read-only post view and there is no swipe;
 * long press keeps View live and Share link.
 */
export const PostRow = memo(function PostRow({ row, meta, now, online, access, index, still, onPress, onMore, onTogglePublish, onTrash }: PostRowProps) {
  const { colors } = useTheme();
  const swipeRef = useRef<SwipeableMethods>(null);
  const [width, setWidth] = useState(0);

  // FlashList recycles cells: a new row never shows the previous row's half-open swipe.
  useEffect(() => {
    swipeRef.current?.reset();
  }, [row.id]);

  const status = statusBadge(meta, row.status);
  const swipes = postSwipeActions(row, access, online);
  const publishAction: SwipeAction | undefined =
    swipes.publish === 'unpublish'
      ? { label: 'Unpublish', icon: EyeOff, tone: 'neutral', onAction: () => onTogglePublish(row) }
      : swipes.publish === 'publish'
        ? { label: 'Publish', icon: Send, tone: 'gold', onAction: () => onTogglePublish(row) }
        : undefined;
  const trashAction: SwipeAction | undefined = swipes.trash
    ? { label: 'Move to trash', icon: Trash2, tone: 'signal', onAction: () => onTrash(row) }
    : undefined;

  const a11yActions = [
    publishAction ? { name: 'publish', label: publishAction.label } : null,
    trashAction ? { name: 'trash', label: trashAction.label } : null,
    { name: 'more', label: 'More actions' },
  ].filter((a): a is { name: string; label: string } => a !== null);

  const onA11yAction = (e: { nativeEvent: { actionName: string } }) => {
    switch (e.nativeEvent.actionName) {
      case 'publish':
        publishAction?.onAction();
        break;
      case 'trash':
        trashAction?.onAction();
        break;
      case 'more':
        onMore(row);
        break;
    }
  };

  const metaLine = rowMetaLine(row, now);

  const body = (
    <PressableScale
      onPress={() => onPress(row)}
      onLongPress={() => onMore(row)}
      pressedScale={0.985}
      accessibilityLabel={rowSpokenLabel(row, meta, now)}
      accessibilityHint={access.canWrite ? 'Opens the editor' : 'Opens the post'}
      accessibilityActions={a11yActions}
      onAccessibilityAction={onA11yAction}
      style={[styles.row, { backgroundColor: colors.bg }]}
    >
      <Text variant="title" numberOfLines={2}>
        {row.title}
      </Text>
      <View style={styles.badges}>
        <Badge label={status.label} tone={status.tone} dot />
        {row.featured ? <Badge label="Featured" tone="neutral" icon={Star} /> : null}
        {row.source === 'ai_draft' ? <Badge label="AI draft" tone="neutral" icon={Sparkles} /> : null}
      </View>
      {metaLine ? (
        <Text variant="small" color="ink3" numberOfLines={2}>
          {metaLine}
        </Text>
      ) : null}
    </PressableScale>
  );

  const threshold = width > 0 ? width * SWIPE_FIRE : undefined;
  const fire = (direction: SwipeDirection) => {
    const action = direction === SwipeDirection.RIGHT ? publishAction : trashAction;
    swipeRef.current?.close();
    action?.onAction();
  };

  return (
    <Animated.View
      entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {publishAction || trashAction ? (
        <ReanimatedSwipeable
          ref={swipeRef}
          friction={1}
          overshootLeft={false}
          overshootRight={false}
          leftThreshold={threshold}
          rightThreshold={threshold}
          onSwipeableWillOpen={fire}
          renderLeftActions={
            publishAction ? (_p, translation) => <ActionPanel action={publishAction} side="left" width={width} translation={translation} /> : undefined
          }
          renderRightActions={
            trashAction ? (_p, translation) => <ActionPanel action={trashAction} side="right" width={width} translation={translation} /> : undefined
          }
        >
          {body}
        </ReanimatedSwipeable>
      ) : (
        body
      )}
    </Animated.View>
  );
});

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
    <View style={[styles.panel, { width, backgroundColor: colors.bg }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
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
    gap: space[2],
    paddingHorizontal: layout.gutter,
    paddingVertical: space[4],
    minHeight: 104,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[1] + 2 },
  panel: { height: '100%' },
  panelContent: { flex: 1, justifyContent: 'center', gap: space[1], paddingHorizontal: space[6] },
  panelLeft: { alignItems: 'flex-start' },
  panelRight: { alignItems: 'flex-end' },
});
