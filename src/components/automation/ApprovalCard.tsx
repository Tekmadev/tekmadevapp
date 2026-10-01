import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { TextArea } from '@/components/form/TextArea';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError, useSubmitGroup } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { relativeTime } from '@/lib/dates';

import { ActionButton } from './ActionButton';
import { ApprovalBlockView } from './ApprovalBlocks';
import type { ApprovalItem } from './types';

export type ApprovalCardProps = {
  item: ApprovalItem;
  /** Approve the proposal. While its promise runs the button shows "Approving" and the others wait. */
  onApprove: () => Promise<unknown> | void;
  /** Open the proposal in its editor (the blog editor for a draft post, and so on). */
  onEdit: () => void;
  /** Reject with the reason the owner typed (always non-empty, trimmed). */
  onReject: (reason: string) => Promise<unknown> | void;
  /** Blocks every action (offline, or while the feed refetches after a decision). */
  disabled?: boolean;
  /** "Publish", "Send": a verb that says what approving does. Default "Approve". */
  approveLabel?: string;
  /** Pending label for approve. Default "Approving". */
  approvingLabel?: string;
  /** Previews taller than this are folded behind "Show full preview" (default 360dp). */
  collapsedHeight?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A preview only folds when it would hide a meaningful amount, never a few lines. */
const FOLD_SLACK = 48;
const FADE_HEIGHT = 56;
const REASON_MAX = 500;

/**
 * The generic Approvals pattern (brief section 12): a proposed item from an
 * automation with a preview made of blocks, and Approve, Edit, Reject.
 *
 * The card renders and asks; the server decides what approving does. Only the
 * pressed action shows its pending state and every other action waits (one
 * submit group per card), so a proposal is never approved twice. Rejecting
 * asks for a reason in a sheet: the automation learns from it.
 * If approving is irreversible for a module (publishing, sending), that module
 * wraps onApprove in its own HoldToConfirm sheet before calling the server.
 */
export function ApprovalCard({
  item,
  onApprove,
  onEdit,
  onReject,
  disabled = false,
  approveLabel = 'Approve',
  approvingLabel = 'Approving',
  collapsedHeight = 360,
  style,
  testID,
}: ApprovalCardProps) {
  const uid = useId();
  const approveId = `${uid}approve`;
  const rejectId = `${uid}reject`;
  const { pendingId, busy, run } = useSubmitGroup();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const approve = () => {
    run(approveId, async () => {
      await onApprove();
    })
      ?.then(() => haptics.success())
      .catch((error: unknown) => {
        haptics.error();
        reportSubmitError(error);
      });
  };

  const submitReject = () => {
    const text = reason.trim();
    if (!text) {
      setReasonError('Add a reason.');
      haptics.error();
      return;
    }
    run(rejectId, async () => {
      await onReject(text);
    })
      ?.then(() => {
        haptics.success();
        setRejecting(false);
        setReason('');
      })
      .catch((error: unknown) => {
        // The sheet stays open with the reason kept, so a retry is one tap.
        haptics.error();
        reportSubmitError(error);
      });
  };

  const approving = pendingId === approveId;
  const rejectPending = pendingId === rejectId;
  const created = item.createdAt ? relativeTime(item.createdAt) : '';

  return (
    <Card testID={testID} style={[styles.card, style]}>
      {item.source || created ? (
        <View style={styles.meta}>
          {item.source ? <Badge label={item.source} tone="gold" style={styles.source} /> : null}
          {created ? (
            <Text variant="small" color="ink4" numberOfLines={1} style={styles.time}>
              {created}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {item.title}
        </Text>
        {item.summary ? (
          <Text variant="body" color="ink3">
            {item.summary}
          </Text>
        ) : null}
      </View>

      {item.blocks.length > 0 ? (
        <Preview collapsedHeight={collapsedHeight}>
          {item.blocks.map((block, i) => (
            <ApprovalBlockView key={`${block.type}-${i}`} block={block} />
          ))}
        </Preview>
      ) : null}

      <View style={styles.actions}>
        <ActionButton
          label={approveLabel}
          pendingLabel={approvingLabel}
          variant="primary"
          pending={approving}
          disabled={disabled || (busy && !approving)}
          onPress={approve}
          accessibilityLabel={`${approveLabel}: ${item.title}`}
          style={styles.primary}
        />
        <ActionButton
          label="Edit"
          variant="secondary"
          disabled={disabled || busy}
          onPress={onEdit}
          accessibilityLabel={`Edit: ${item.title}`}
        />
        <ActionButton
          label="Reject"
          variant="ghost"
          disabled={disabled || busy}
          onPress={() => {
            setReasonError(null);
            setRejecting(true);
          }}
          accessibilityLabel={`Reject: ${item.title}`}
        />
      </View>

      <Sheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        dismissible={!rejectPending}
        title="Reject this?"
        subtitle="Say why. The reason goes back to whatever proposed it, so the next one is better."
        footer={
          <ActionButton
            label="Reject"
            pendingLabel="Rejecting"
            variant="primary"
            pending={rejectPending}
            disabled={disabled || (busy && !rejectPending)}
            onPress={submitReject}
            style={styles.sheetButton}
          />
        }
      >
        <View style={styles.sheetBody}>
          <Text variant="label" color="ink2" numberOfLines={2}>
            {item.title}
          </Text>
          <TextArea
            label="Reason"
            value={reason}
            onChangeText={(text) => {
              setReason(text);
              if (reasonError && text.trim()) setReasonError(null);
            }}
            error={reasonError}
            maxLength={REASON_MAX}
            autoFocus
            disabled={rejectPending}
            minLines={3}
          />
        </View>
      </Sheet>
    </Card>
  );
}

/**
 * Folds a long preview (a whole drafted article) to `collapsedHeight` with a
 * soft fade, and opens it on a soft spring. Short previews are left alone.
 */
function Preview({ collapsedHeight, children }: { collapsedHeight: number; children: ReactNode }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const gradientId = `fade${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const [contentHeight, setContentHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const folds = contentHeight > collapsedHeight + FOLD_SLACK;
  const target = folds && !expanded ? collapsedHeight : contentHeight;
  const height = useSharedValue(collapsedHeight);
  // Whether the first fold has been applied. Only the effect reads it, so it is a ref, not state.
  const settled = useRef(false);

  useEffect(() => {
    if (!folds) return;
    // The first fold is instant (no growing card on mount); toggles move on the soft spring.
    if (!settled.current || reduceMotion) {
      height.set(target);
      settled.current = true;
      return;
    }
    height.set(withSpring(target, springs.soft));
  }, [folds, target, reduceMotion, height]);

  const animated = useAnimatedStyle(() => ({ height: height.get() }));

  const onContentLayout = (e: LayoutChangeEvent) => {
    const next = Math.ceil(e.nativeEvent.layout.height);
    if (next !== contentHeight) setContentHeight(next);
  };

  return (
    <View style={styles.preview}>
      <Animated.View style={[styles.clip, folds ? animated : null]}>
        <View onLayout={onContentLayout} style={styles.blocks}>
          {children}
        </View>
        {folds && !expanded ? (
          <View pointerEvents="none" style={[styles.fade, { height: FADE_HEIGHT }]}>
            <Svg width="100%" height={FADE_HEIGHT}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.surface} stopOpacity={0} />
                  <Stop offset="1" stopColor={colors.surface} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height={FADE_HEIGHT} fill={`url(#${gradientId})`} />
            </Svg>
          </View>
        ) : null}
      </Animated.View>
      {folds ? (
        <PressableScale
          onPress={() => setExpanded((v) => !v)}
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Show less of the preview' : 'Show the full preview'}
          style={styles.toggle}
        >
          <Text variant="label" tone="gold">
            {expanded ? 'Show less' : 'Show full preview'}
          </Text>
          <Icon icon={expanded ? ChevronUp : ChevronDown} size={16} tone="gold" />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: -space[2] },
  source: { flexShrink: 1 },
  time: { marginLeft: 'auto' },
  head: { gap: space[1] },
  preview: { gap: space[1] },
  clip: { overflow: 'hidden' },
  blocks: { gap: space[4] },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1],
    minHeight: layout.minTouch,
    paddingRight: space[2],
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  primary: { flexGrow: 1 },
  sheetBody: { gap: space[3], paddingTop: space[3] },
  sheetButton: { marginTop: space[3] },
});
