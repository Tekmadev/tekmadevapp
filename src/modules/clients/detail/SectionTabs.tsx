import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ScrollTabs, type ScrollTabItem } from '@/components/ScrollTabs';
import { layout } from '@/design/tokens';
import type { ClientSection } from '@/lib/deeplinks';

import { activeSectionIndex, SECTION_LABELS } from './logic';

/** Scroll the reader may drift from where a tapped tab landed before the scroll spy takes over again. */
const PIN_SLOP = 24;

export type SectionSpy = {
  /** The screen's scroll offset, written on the UI thread. */
  scrollY: SharedValue<number>;
  /** Section tops in scroll content coordinates, in tab order (UNMEASURED until laid out). */
  offsets: SharedValue<number[]>;
  /** This row's height, for jump targets and the spy line. */
  tabsHeight: SharedValue<number>;
  /** Index of a tapped (or deep linked) section that stays active while the jump lands; -1 for none. */
  pinned: SharedValue<number>;
  /** True while the jump's smooth scroll is still moving. */
  gliding: SharedValue<boolean>;
  /** Where the jump landed. */
  anchorY: SharedValue<number>;
};

export type SectionTabsProps = SectionSpy & {
  sections: readonly ClientSection[];
  /** Distance below the tabs of the line that decides which section is being read. */
  probe: number;
  onJump: (section: ClientSection) => void;
  onHeight: (height: number) => void;
};

/**
 * The sticky section tabs. It owns the active tab, so the scroll spy (a
 * reaction on the UI thread) re-renders only this row, and only when the
 * section being read changes. A tapped tab stays active while its jump glides
 * and lands, even when a short section could not reach the top on its own.
 */
export const SectionTabs = memo(function SectionTabs({
  sections,
  scrollY,
  offsets,
  tabsHeight,
  pinned,
  gliding,
  anchorY,
  probe,
  onJump,
  onHeight,
}: SectionTabsProps) {
  const [active, setActive] = useState<ClientSection | null>(null);
  const items: ScrollTabItem<ClientSection>[] = sections.map((s) => ({ value: s, label: SECTION_LABELS[s] }));
  const current = active && sections.includes(active) ? active : (sections[0] ?? 'onboarding');

  const setActiveIndex = (index: number) => {
    const section = sections[index];
    if (section) setActive(section);
  };

  useAnimatedReaction(
    () => {
      const y = scrollY.get();
      const p = pinned.get();
      if (p >= 0 && (gliding.get() || Math.abs(y - anchorY.get()) < PIN_SLOP)) return p;
      return activeSectionIndex(offsets.get(), y + tabsHeight.get() + probe);
    },
    (index, previous) => {
      if (index !== previous) scheduleOnRN(setActiveIndex, index);
    },
    [probe, sections],
  );

  return (
    <View style={styles.bleed} onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      <ScrollTabs
        items={items}
        active={current}
        bleed={false}
        accessibilityLabel="Client sections"
        onChange={(section) => {
          setActive(section);
          onJump(section);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  // Full width, so the bar covers what scrolls beneath it and every part of it takes touches.
  bleed: { marginHorizontal: -layout.gutter },
});
