import { Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { KeyValue } from '@/components/KeyValue';
import { ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { Slider } from '@/components/form/Slider';
import { SwitchRow } from '@/components/form/Switch';
import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { BlackHole } from '@/loader/BlackHole';
import { BreathingMark } from '@/loader/BreathingMark';
import { InlineLoader } from '@/loader/InlineLoader';
import { LogoMark } from '@/loader/LogoMark';
import { PageLoader } from '@/loader/PageLoader';
import { PullToRefreshIndicator } from '@/loader/PullToRefreshIndicator';
import { useLoaderSettings } from '@/loader/settings';

import { Caption, Demo, Labeled, Wrap } from '../kitLayout';

/** The system setting the loader follows, by its name on each platform. */
const REDUCE_MOTION = Platform.select({
  ios: {
    note: 'Follows iPhone Settings, Accessibility, Motion, Reduce Motion, live.',
    on: 'Reduce Motion is on',
    off: 'Reduce Motion is off',
  },
  default: {
    note: 'Follows Android Settings, Accessibility, Remove animations, live.',
    on: 'Remove animations is on',
    off: 'Remove animations is off',
  },
});

export type LoaderDemosProps = {
  /** Drives the TopProgress demo and the Kit screen's own header hairline. */
  refetching: boolean;
  onRefetchingChange: (on: boolean) => void;
  /** Plays the boot splash over the whole screen. */
  onReplaySplash: () => void;
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function LoaderDemos({ refetching, onRefetchingChange, onReplaySplash }: LoaderDemosProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const settings = useLoaderSettings();

  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  const pull = useSharedValue(0);
  const [pullValue, setPullValue] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onPull = (v: number) => {
    setPullValue(v);
    // Slider updates arrive about every 48ms; a short glide in between keeps the pieces smooth.
    pull.set(withTiming(v, { duration: 60 }));
  };

  return (
    <>
      <Demo title="Reduced motion" note={REDUCE_MOTION.note}>
        <View style={styles.row}>
          <Badge label={reduceMotion ? REDUCE_MOTION.on : REDUCE_MOTION.off} tone={reduceMotion ? 'gold' : 'muted'} dot />
        </View>
        <Text variant="small" color="ink3">
          When it is on, every mark stops spinning and scaling: all four pieces fade together, 1 to 0.4 to 1 over 1.6s. The
          hairline shows a still 85% bar, and staggers, parallax and count-ups are off.
        </Text>
      </Demo>

      <Demo title="Black hole" note="The raw mark at 72dp (page loader size) and 96dp (Loader screen preview)." live>
        <Wrap gap={space[6]} align="flex-end">
          <Labeled label="72dp">
            <BlackHole size={72} paused={paused} accessibilityLabel="Loading" />
          </Labeled>
          <Labeled label="96dp">
            <BlackHole size={96} paused={paused} />
          </Labeled>
        </Wrap>
        <SwitchRow
          label="Pause"
          description="Finishes the beat into the whole logo, then rests."
          value={paused}
          onValueChange={setPaused}
        />
      </Demo>

      <Demo title="Inside buttons" note="The button spinner: label sized, button text colour, buttonBeatMs." live>
        <Wrap gap={space[2]}>
          <Button label="Save changes" pending pendingLabel="Saving" />
          <Button label="Book a call" variant="secondary" pending pendingLabel="Booking…" />
          <Button label="Delete" variant="destructive" pending pendingLabel="Deleting" />
          <Button label="Publish" variant="gold" pending pendingLabel="Publishing" />
          <Button label="Retry" variant="ghost" pending pendingLabel="Retrying" />
          <Button label="Save" size="sm" pending pendingLabel="Saving" />
        </Wrap>
      </Demo>

      <Demo title="Inline" note="14 to 16dp for row-level work, like a row being saved." padded={false} live>
        <ListRow
          title="Acme Plumbing"
          subtitle="Saving the new plan"
          icon={Sparkles}
          iconTone="gold"
          trailing={<InlineLoader size={16} />}
        />
        <ListRow title="Northline Roofing" subtitle="14dp" icon={Sparkles} trailing={<InlineLoader size={14} />} />
      </Demo>

      <Demo title="Page loader" note={`Invisible for showAfterMs (${settings.showAfterMs}ms), then fades in over 250ms.`} live>
        <View style={[styles.pageBox, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          <PageLoader key={replay} />
        </View>
        <Button label="Replay the delay" variant="secondary" size="sm" onPress={() => setReplay((n) => n + 1)} />
      </Demo>

      <Demo title="Pull to refresh" note="Scrub the pull: the pieces come together and lock at 100%. Or pull this screen down from the very top." live>
        <View style={[styles.pullBox, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          <PullToRefreshIndicator pull={pull} refreshing={refreshing} size={36} />
        </View>
        <Slider
          label="Pull"
          value={pullValue}
          min={0}
          max={1.2}
          step={0.01}
          format={percent}
          onChange={onPull}
          help="100% is the trigger point. Past it is overpull."
        />
        <SwitchRow
          label="Refreshing"
          description="Beats until the data lands. Turned off, it shrinks away; pull back to 0 to arm it again."
          value={refreshing}
          onValueChange={setRefreshing}
        />
      </Demo>

      <Demo title="Top progress" note="The 2dp hairline while a screen refetches with data already shown.">
        <View style={[styles.headerBox, { borderColor: colors.line }]}>
          <Header title="Clients" safeTop={false} bordered progress={refetching} />
        </View>
        <SwitchRow
          label="Refetching"
          description="Runs the hairline here and under this screen's own header."
          value={refetching}
          onValueChange={onRefetchingChange}
        />
      </Demo>

      <Demo title="Breathing mark" note="The sign-in hero: one soft beat every 6 seconds." live>
        <View style={styles.center}>
          <BreathingMark size={96} />
        </View>
      </Demo>

      <Demo title="Static mark" note="LogoMark: the EmptyState watermark, avatars, the QR centre.">
        <Wrap gap={space[5]} align="flex-end">
          <Labeled label="24">
            <LogoMark size={24} />
          </Labeled>
          <Labeled label="40">
            <LogoMark size={40} />
          </Labeled>
          <Labeled label="72 at 14%">
            <LogoMark size={72} opacity={0.14} />
          </Labeled>
          <Labeled label="ink">
            <LogoMark size={40} color={colors.ink} />
          </Labeled>
        </Wrap>
      </Demo>

      <Demo title="Boot splash" note="Plays over the whole screen: pulled together, a beat, then it fades.">
        <Button label="Replay the boot splash" variant="secondary" onPress={onReplaySplash} />
      </Demo>

      <Demo title="Settings in use" note="From GET /me, clamped and cached. The Loader screen previews live." padded={false}>
        <KeyValue
          items={[
            { label: 'beatMs', value: seconds(settings.beatMs), mono: true },
            { label: 'buttonBeatMs', value: seconds(settings.buttonBeatMs), mono: true },
            { label: 'innerPull', value: percent(settings.innerPull), mono: true },
            { label: 'outerPull', value: percent(settings.outerPull), mono: true },
            { label: 'innerFade', value: percent(settings.innerFade), mono: true },
            { label: 'showAfterMs', value: `${settings.showAfterMs}ms`, mono: true },
          ]}
        />
        <View style={styles.inset}>
          <Caption>Values outside the ranges are clamped; anything that is not a number falls back to the default.</Caption>
        </View>
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  center: { alignItems: 'center', paddingVertical: space[2] },
  pageBox: { height: 168, borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden' },
  pullBox: { height: 112, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerBox: { borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden' },
  inset: { paddingHorizontal: space[4], paddingTop: space[1] },
});
