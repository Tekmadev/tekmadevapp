import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { FilterChips, type FilterChipItem } from '@/components/FilterChips';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';

import { activeSectionIndex, KIT_SECTIONS, type KitSectionId } from './kitSections';

const CHIPS: readonly FilterChipItem<KitSectionId>[] = KIT_SECTIONS.map((s) => ({ value: s.id, label: s.label }));

export type JumpRowProps = {
  scrollY: SharedValue<number>;
  /** Section tops in scroll content coordinates, in KIT_SECTIONS order. */
  offsets: SharedValue<number[]>;
  /** Where the row starts in the content; past it, the row is stuck under the header. */
  stickyTop: SharedValue<number>;
  /** Written here: the row's height, for jump targets and the scroll spy. */
  stickyHeight: SharedValue<number>;
  /** True while a jump glides, so the chips do not flicker through every section passed. */
  jumping: SharedValue<boolean>;
  /** Distance below the row of the line that decides which section is current. */
  probe: number;
  onJump: (id: KitSectionId) => void;
};

/**
 * The sticky "Jump to" row. It owns the current-section state, so the scroll
 * spy re-renders only this row, never the screen full of demos under it.
 */
export const JumpRow = memo(function JumpRow({ scrollY, offsets, stickyTop, stickyHeight, jumping, probe, onJump }: JumpRowProps) {
  const { colors } = useTheme();
  const [active, setActive] = useState<KitSectionId>('type');

  const setActiveIndex = (index: number) => {
    const section = KIT_SECTIONS[index];
    if (section) setActive(section.id);
  };
  useAnimatedReaction(
    () => (jumping.get() ? -1 : activeSectionIndex(offsets.get(), scrollY.get() + stickyHeight.get() + probe)),
    (index, previous) => {
      if (index >= 0 && index !== previous) scheduleOnRN(setActiveIndex, index);
    },
    [probe],
  );

  // The hairline shows only while the row is stuck under the header.
  const stuckStyle = useAnimatedStyle(() => ({ opacity: scrollY.get() > stickyTop.get() ? 1 : 0 }));

  return (
    <View style={[styles.row, { backgroundColor: colors.bg }]} onLayout={(e) => stickyHeight.set(e.nativeEvent.layout.height)}>
      <Text variant="eyebrow" style={styles.label}>
        Jump to
      </Text>
      <FilterChips
        items={CHIPS}
        value={active}
        // Tapping the current chip reports null; it still means "take me to the top of it".
        allowDeselect
        onChange={(id) => {
          const target = id ?? active;
          setActive(target);
          onJump(target);
        }}
        accessibilityLabel="Jump to a section"
      />
      <Animated.View pointerEvents="none" style={[styles.line, { backgroundColor: colors.line }, stuckStyle]} />
    </View>
  );
});

const styles = StyleSheet.create({
  // Bleeds to the screen edges so content scrolling under it is fully covered. The
  // space under the chips is padding, not margin: a margin would be a see-through
  // band that still swallows taps on whatever scrolls beneath it.
  row: {
    marginHorizontal: -layout.gutter,
    paddingHorizontal: layout.gutter,
    paddingTop: space[1],
    paddingBottom: space[3],
  },
  label: { marginBottom: space[1] },
  line: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 },
});
