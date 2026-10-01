import { Check } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { countLabel } from '@/lib/format';

import { Icon } from './Icon';
import { Text } from './Text';
import { percentLabel, stageStates, type StageState } from './parts/logic';

export type Stage = {
  value: string;
  label: string;
  /** Days spent in (or planned for) this stage, shown under the label. */
  days?: number | null;
};

export type StageTrackerProps = {
  stages: readonly Stage[];
  /** The `value` of the stage in progress. Unknown or null marks every stage as not started. */
  current: string | null | undefined;
  /** Overall completion, 0 to 100, shown above the steps. */
  percent?: number | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const NODE = 24;
const MIN_STAGE_WIDTH = 84;
const STATE_WORDS: Record<StageState, string> = { done: 'done', current: 'current stage', todo: 'not started' };

/**
 * Onboarding stages as a horizontal stepper: done stages filled gold with a
 * tick, the current one with a soft pulse (a static ring with reduced motion),
 * the rest muted. Scrolls sideways when the stages do not fit.
 */
export function StageTracker({ stages, current, percent, style, testID }: StageTrackerProps) {
  const states = stageStates(
    stages.map((s) => s.value),
    current,
  );
  const at = states.indexOf('current');
  const showPercent = percent != null && Number.isFinite(percent);

  return (
    <View testID={testID} style={style}>
      {showPercent ? (
        <Text variant="label" color="ink3" tabular style={styles.percent}>
          {`${percentLabel(percent)} complete`}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.row} accessibilityRole="list">
          {stages.map((stage, i) => (
            <StageCell
              key={stage.value}
              stage={stage}
              state={states[i] ?? 'todo'}
              first={i === 0}
              last={i === stages.length - 1}
              leftDone={at >= 0 && i <= at}
              rightDone={at >= 0 && i < at}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function StageCell({
  stage,
  state,
  first,
  last,
  leftDone,
  rightDone,
}: {
  stage: Stage;
  state: StageState;
  first: boolean;
  last: boolean;
  leftDone: boolean;
  rightDone: boolean;
}) {
  const { colors } = useTheme();
  const days = stage.days != null && Number.isFinite(stage.days) ? countLabel(stage.days, 'day', 'days') : null;
  const lineColor = (done: boolean, hidden: boolean) => (hidden ? 'transparent' : done ? colors.gold : colors.line);

  return (
    <View
      style={styles.cell}
      accessible
      accessibilityLabel={`${stage.label}, ${STATE_WORDS[state]}${days ? `, ${days}` : ''}`}
    >
      <View style={styles.track}>
        <View style={[styles.line, { backgroundColor: lineColor(leftDone, first) }]} />
        <StageNode state={state} />
        <View style={[styles.line, { backgroundColor: lineColor(rightDone, last) }]} />
      </View>
      <Text
        variant="caption"
        align="center"
        weight={state === 'current' ? '600' : '500'}
        color={state === 'todo' ? 'ink4' : state === 'current' ? 'ink' : 'ink2'}
        numberOfLines={2}
        style={styles.label}
      >
        {stage.label}
      </Text>
      {days ? (
        <Text variant="caption" align="center" color="ink4" tabular>
          {days}
        </Text>
      ) : null}
    </View>
  );
}

function StageNode({ state }: { state: StageState }) {
  const { colors } = useTheme();
  if (state === 'done') {
    return (
      <View style={[styles.node, { backgroundColor: colors.gold, borderColor: colors.gold }]}>
        <Icon icon={Check} size={14} color="onInk" strokeWidth={2.5} />
      </View>
    );
  }
  if (state === 'current') return <CurrentNode />;
  return <View style={[styles.node, { borderColor: colors.lineStrong, backgroundColor: colors.bg }]} />;
}

/** The stage in progress: a gold dot in a ring, with a slow ripple. */
function CurrentNode() {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    pulse.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : 0.45 * (1 - pulse.get()),
    transform: [{ scale: 1 + pulse.get() * 0.7 }],
  }));

  return (
    <View style={styles.nodeBox}>
      <Animated.View pointerEvents="none" style={[styles.node, styles.ripple, { borderColor: colors.gold }, rippleStyle]} />
      <View style={[styles.node, styles.currentRing, { borderColor: colors.gold, backgroundColor: colors.goldTint }]}>
        <View style={[styles.dot, { backgroundColor: colors.gold }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  percent: { marginBottom: space[3] },
  scroll: { flexGrow: 1 },
  row: { flexDirection: 'row', flexGrow: 1 },
  cell: { flex: 1, minWidth: MIN_STAGE_WIDTH, alignItems: 'center' },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2 },
  nodeBox: { width: NODE, height: NODE },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentRing: { borderWidth: 2 },
  ripple: { position: 'absolute', borderWidth: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { marginTop: space[2], paddingHorizontal: space[1] },
});
