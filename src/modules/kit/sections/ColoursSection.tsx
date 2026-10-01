import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Badge } from '@/components/Badge';
import { Grain } from '@/components/Grain';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space, TONES, type Palette } from '@/design/tokens';

import { Caption, Demo, Wrap } from '../kitLayout';

type ColourKey = Exclude<keyof Palette, 'goldGradient'>;

const GROUPS: readonly { title: string; keys: readonly ColourKey[] }[] = [
  { title: 'Surfaces', keys: ['bg', 'bg2', 'bg3', 'surface'] },
  { title: 'Ink', keys: ['ink', 'ink2', 'ink3', 'ink4', 'ink5', 'onInk'] },
  { title: 'Lines', keys: ['line', 'lineStrong', 'lineSoft'] },
  { title: 'Gold and signal', keys: ['gold', 'goldDeep', 'goldMid', 'goldSoft', 'goldTint', 'signal'] },
  { title: 'Overlays', keys: ['scrim', 'shadow'] },
];

const RADII: readonly (keyof typeof radius)[] = ['xs', 'sm', 'input', 'card', 'sheet', 'pill'];
const SPACES = [1, 2, 3, 4, 5, 6, 8, 12, 16] as const;

function Swatch({ name, value }: { name: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.swatch}>
      <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: value }]} />
      </View>
      <View style={styles.swatchText}>
        <Text variant="mono" numberOfLines={1}>
          {name}
        </Text>
        <Caption>{value}</Caption>
      </View>
    </View>
  );
}

function GoldGradient() {
  const { colors } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [from, to] = colors.goldGradient;
  return (
    <View style={styles.gradient}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          {/* 135deg: top left to bottom right. */}
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <Text variant="kpi" color="onInk">
        $12,480
      </Text>
    </View>
  );
}

export function ColoursDemos() {
  const { colors, tones, scheme } = useTheme();
  return (
    <>
      {GROUPS.map((group) => (
        <Demo key={group.title} title={group.title} note={group.title === 'Surfaces' ? `Values for the ${scheme} theme.` : undefined}>
          <View style={styles.grid}>
            {group.keys.map((key) => (
              <Swatch key={key} name={key} value={colors[key]} />
            ))}
          </View>
        </Demo>
      ))}

      <Demo title="Status tones" note="Tinted background, text colour and dot, per theme.">
        {TONES.map((tone) => (
          <View key={tone} style={styles.toneRow}>
            <Badge label={tone} tone={tone} dot size="md" />
            <View style={styles.toneValues}>
              <Caption>{`text ${tones[tone].text}`}</Caption>
              <Caption>{`bg ${tones[tone].bg}`}</Caption>
            </View>
          </View>
        ))}
      </Demo>

      <Demo title="Gold gradient" note="135deg, for hero numbers and the tab indicator.">
        <GoldGradient />
        <Caption>{`${colors.goldGradient[0]} to ${colors.goldGradient[1]}`}</Caption>
      </Demo>

      <Demo title="Grain" note="Skia noise for the splash, sign in and the Home header.">
        <Wrap gap={space[3]}>
          <View style={[styles.grain, { backgroundColor: colors.bg }]}>
            <Grain />
            <Caption>5% (default)</Caption>
          </View>
          <View style={[styles.grain, { backgroundColor: colors.bg }]}>
            <Grain opacity={0.15} />
            <Caption>15%, to see it</Caption>
          </View>
        </Wrap>
      </Demo>

      <Demo title="Radii" note="Pills for chips and buttons, 20 cards, 28 sheets, 14 inputs.">
        <Wrap gap={space[3]}>
          {RADII.map((r) => (
            <View key={r} style={styles.radiusItem}>
              <View style={[styles.radiusBox, { borderRadius: radius[r], backgroundColor: colors.goldTint, borderColor: colors.gold }]} />
              <Caption>{`${r} ${radius[r]}`}</Caption>
            </View>
          ))}
        </Wrap>
      </Demo>

      <Demo title="Spacing" note="The 4pt grid.">
        {SPACES.map((s) => (
          <View key={s} style={styles.spaceRow}>
            <View style={styles.spaceLabel}>
              <Caption>{`space[${s}] ${space[s]}`}</Caption>
            </View>
            <View style={{ width: space[s], height: space[2], backgroundColor: colors.gold, borderRadius: 2 }} />
          </View>
        ))}
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space[3] },
  swatch: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: space[2], paddingRight: space[2] },
  chip: { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden' },
  swatchText: { flex: 1, minWidth: 0 },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  toneValues: { flex: 1 },
  gradient: { height: 88, borderRadius: radius.card, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: space[4] },
  grain: { width: 132, height: 88, borderRadius: radius.sm, overflow: 'hidden', justifyContent: 'flex-end', padding: space[2] },
  radiusItem: { alignItems: 'center', gap: space[1] },
  radiusBox: { width: 56, height: 56, borderWidth: 1 },
  spaceRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  spaceLabel: { width: 96 },
});
