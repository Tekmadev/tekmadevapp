import { StyleSheet, View, type TextStyle } from 'react-native';

import { Text, type TextColor } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { space, TONES } from '@/design/tokens';
import { MAX_FONT_SCALE, type, type TypeVariant } from '@/design/typography';

import { Caption, Demo, Wrap } from '../kitLayout';

/** Every variant of the type scale, with a sample that fits what it is for. */
const SAMPLES: Record<TypeVariant, string> = {
  largeTitle: 'Clients',
  kpi: '$12,480',
  kpiLarge: '$77.50',
  number: '1,204',
  headline: 'Acme Plumbing',
  headlineSmall: 'This week',
  headlineLarge: 'Good morning',
  title: 'Move to trash?',
  body: 'Lead forms, booked calls and portal sign-ups appear here.',
  bodyStrong: 'Payment received',
  editor: 'The first paragraph of a blog post reads like this.',
  small: 'Synced 2:41 PM',
  label: 'Business name',
  caption: 'Updated 3m ago',
  button: 'Save changes',
  eyebrow: 'Revenue this month',
  mono: 'tekmadev.com/start',
  monoLarge: 'SPRING25',
};

const VARIANTS = Object.keys(type) as TypeVariant[];

const INKS: readonly TextColor[] = ['ink', 'ink2', 'ink3', 'ink4', 'ink5', 'gold', 'goldDeep', 'goldMid', 'signal'];

function spec(v: TypeVariant): string {
  // Widen to TextStyle: not every variant sets letter spacing.
  const s: TextStyle = type[v];
  const tracking = s.letterSpacing ? ` · ${Math.round(s.letterSpacing * 100) / 100} tracking` : '';
  return `${v} · ${s.fontSize}/${s.lineHeight} · ${s.fontFamily} ${s.fontWeight}${tracking}`;
}

export function TypographyDemos() {
  const { colors } = useTheme();
  return (
    <>
      <Demo title="Type scale" note={`Every variant of <Text>. Font scale is capped at ${MAX_FONT_SCALE}x.`} gap={space[4]}>
        {VARIANTS.map((v) => (
          <View key={v} style={styles.sample}>
            <Text variant={v} numberOfLines={2}>
              {SAMPLES[v]}
            </Text>
            <Caption>{spec(v)}</Caption>
          </View>
        ))}
      </Demo>

      <Demo title="Text colours" note="Palette colours a <Text> can take.">
        {INKS.map((c) => (
          <View key={c} style={styles.row}>
            <Text variant="bodyStrong" color={c} style={styles.flex}>
              The quick brown fox
            </Text>
            <Caption>{c}</Caption>
          </View>
        ))}
        <View style={[styles.onInk, { backgroundColor: colors.ink }]}>
          <Text variant="bodyStrong" color="onInk">
            onInk on an ink fill
          </Text>
        </View>
      </Demo>

      <Demo title="Tone text" note="Status tones as text. Badges always pair them with a word.">
        <Wrap gap={space[4]}>
          {TONES.map((t) => (
            <Text key={t} variant="bodyStrong" tone={t}>
              {t}
            </Text>
          ))}
        </Wrap>
      </Demo>

      <Demo title="Tabular figures" note="Numbers that are compared line up digit by digit.">
        <View style={styles.row}>
          <Text variant="eyebrow" style={styles.figure}>
            Proportional
          </Text>
          <Text variant="eyebrow" style={styles.figure}>
            Tabular
          </Text>
        </View>
        {['$1,111.11', '$8,888.88', '$77.50'].map((n) => (
          <View key={n} style={styles.row}>
            <Text variant="bodyStrong" style={styles.figure}>
              {n}
            </Text>
            <Text variant="bodyStrong" tabular style={styles.figure}>
              {n}
            </Text>
          </View>
        ))}
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  sample: { gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  figure: { width: 120, textAlign: 'right' },
  onInk: { borderRadius: space[2], paddingHorizontal: space[3], paddingVertical: space[2], alignSelf: 'flex-start' },
});
