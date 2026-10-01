import { createContext, use, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAnimatedReaction, useDerivedValue, useSharedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import { sectionNumber, type KitSectionId } from './kitSections';

/**
 * Building blocks of the Kit screen: a section that reports where it is (for
 * "Jump to"), a demo card, and the visibility plumbing that keeps the screen
 * light. Heavy sections mount when you scroll near them, and demos with
 * animated canvases unmount while they are far off screen (they sit in boxes
 * of a fixed size, so nothing moves when they come and go).
 */

type KitScroll = {
  /** The Kit scroll offset, written on the UI thread by Screen. */
  scrollY: SharedValue<number>;
  /** Visible height of the scroll area (the window is close enough). */
  viewport: number;
  /**
   * True while a "Jump to" scroll glides: nothing mounts or unmounts on the way,
   * so sections the glide passes do not move its target.
   */
  paused: SharedValue<boolean>;
};

export const KitScrollContext = createContext<KitScroll | null>(null);

/** The enclosing section's top in scroll content coordinates (-1 until measured). */
const SectionTopContext = createContext<SharedValue<number> | null>(null);

type InViewOptions = {
  /** Extra distance above and below the viewport that still counts as in view. */
  margin: number;
  /** Stay true once true (mount once, never unmount). */
  once: boolean;
  /** The answer before the box has been measured, and whenever tracking is off. */
  initial: boolean;
  /** Track the scroll at all (default true). Off, it costs nothing per frame. */
  enabled?: boolean;
};

/**
 * Whether a box (top and height in scroll content coordinates) is within
 * `margin` of the visible area. Computed on the UI thread as the screen
 * scrolls; React only hears about it when the answer flips.
 */
export function useInView(
  top: DerivedValue<number>,
  height: DerivedValue<number>,
  { margin, once, initial, enabled = true }: InViewOptions,
): boolean {
  const ctx = use(KitScrollContext);
  // A reaction re-runs whenever a shared value it captures changes, so a box that
  // does not track gets a value that never changes instead of the scroll offset.
  const still = useSharedValue(0);
  const neverPaused = useSharedValue(false);
  const tracking = enabled && ctx !== null;
  const scrollY = tracking ? ctx.scrollY : still;
  const paused = tracking ? ctx.paused : neverPaused;
  const viewport = tracking ? ctx.viewport : 0;
  const [inView, setInView] = useState(initial);

  useAnimatedReaction(
    // 1 in view, 0 out of view, -1 undecided while a jump glides.
    () => {
      const t = top.get();
      // Not tracking, no scroll context, or not measured yet.
      if (viewport <= 0 || t < 0) return initial ? 1 : 0;
      if (paused.get()) return -1;
      const y = scrollY.get();
      return t < y + viewport + margin && t + height.get() > y - margin ? 1 : 0;
    },
    (now, previous) => {
      if (now === previous || now < 0) return;
      if (once && now === 0) return;
      scheduleOnRN(setInView, now === 1);
    },
    [viewport, margin, once, initial, scrollY, paused],
  );

  return tracking ? inView : initial;
}

export type KitSectionProps = {
  id: KitSectionId;
  index: number;
  title: string;
  /** Mount the demos only when the section scrolls near (heavy sections). */
  lazy?: boolean;
  /** Height held for a lazy section before it mounts, so later sections sit close to their final place. */
  estimatedHeight?: number;
  /** Reports the section's top and height in scroll content coordinates. */
  onMeasure: (id: KitSectionId, top: number, height: number) => void;
  /** Demo cards. Keep them direct children so their visibility math works. */
  children: ReactNode;
};

/**
 * One section of the Kit: a numbered eyebrow and title (the real Section
 * component), then demo cards. Render it as a direct child of the Screen so
 * its layout `y` is its offset in the scroll content.
 */
export function KitSection({ id, index, title, lazy = false, estimatedHeight = 800, onMeasure, children }: KitSectionProps) {
  const ctx = use(KitScrollContext);
  const top = useSharedValue(-1);
  const height = useSharedValue(0);
  // Without the Kit's scroll context there is nothing to wait for: mount straight away.
  const near = useInView(top, height, { margin: ctx?.viewport ?? 0, once: true, initial: !lazy || ctx === null, enabled: lazy });
  const mounted = !lazy || near;

  return (
    <View
      testID={`kit-section-${id}`}
      onLayout={(e) => {
        const { y, height: h } = e.nativeEvent.layout;
        top.set(y);
        height.set(h);
        onMeasure(id, y, h);
      }}
    >
      <SectionTopContext value={top}>
        <Section eyebrow={sectionNumber(index)} title={title}>
          {mounted ? children : <View style={{ height: estimatedHeight }} accessibilityLabel={`${title}, loads as you scroll`} />}
        </Section>
      </SectionTopContext>
    </View>
  );
}

export type DemoProps = {
  /** What the card shows ("Variants", "Pending in a submit group"). */
  title: string;
  /** One quiet line on how to use the demo. */
  note?: string;
  /**
   * Holds animated canvases: unmount them while the card is far off screen.
   * The card keeps its height, so the content must be a fixed size.
   */
  live?: boolean;
  /** 16dp padding around the content (default true). Off for edge to edge rows. */
  padded?: boolean;
  /** No card around the content: for components that are cards themselves (StatCard, ApprovalCard). */
  bare?: boolean;
  /** Gap between the content's children (default 12). */
  gap?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** A demo card: a label, an optional note, then the component in its states. */
export function Demo({ title, note, live = false, padded = true, bare = false, gap = space[3], children, style }: DemoProps) {
  const sectionTop = use(SectionTopContext);
  const noSection = useSharedValue(-1);
  const sTop = sectionTop ?? noSection;
  const localTop = useSharedValue(-1);
  const localHeight = useSharedValue(0);
  const absoluteTop = useDerivedValue(() => {
    const s = sTop.get();
    const l = localTop.get();
    return s < 0 || l < 0 ? -1 : s + l;
  });
  const visible = useInView(absoluteTop, localHeight, { margin: 240, once: false, initial: true, enabled: live });
  const [bodyHeight, setBodyHeight] = useState(0);
  const showBody = !live || visible || bodyHeight === 0;

  const header = (
    <View style={bare ? styles.bareHeader : styles.header}>
      <Text variant="label" color="ink2">
        {title}
      </Text>
      {note ? (
        <Text variant="small" color="ink3">
          {note}
        </Text>
      ) : null}
    </View>
  );
  const body = showBody ? (
    <View
      onLayout={live ? (e) => setBodyHeight(e.nativeEvent.layout.height) : undefined}
      style={[bare ? null : padded ? styles.padded : styles.edge, { gap }]}
    >
      {children}
    </View>
  ) : (
    <View style={{ height: bodyHeight }} />
  );

  return (
    <View
      style={[styles.demo, style]}
      onLayout={(e) => {
        localTop.set(e.nativeEvent.layout.y);
        localHeight.set(e.nativeEvent.layout.height);
      }}
    >
      {bare ? (
        <>
          {header}
          {body}
        </>
      ) : (
        <Card padded={false}>
          {header}
          {body}
        </Card>
      )}
    </View>
  );
}

/** Children side by side, wrapping onto the next line when they run out of room. */
export function Wrap({ children, gap = space[2], align = 'center', style }: { children: ReactNode; gap?: number; align?: ViewStyle['alignItems']; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.wrap, { gap, alignItems: align }, style]}>{children}</View>;
}

/** A small mono caption under or beside a sample ("kpi · 40/38 · 800"). */
export function Caption({ children }: { children: string }) {
  return (
    <Text variant="caption" color="ink4" numberOfLines={2}>
      {children}
    </Text>
  );
}

/** A labelled sample: the component, then its caption. */
export function Labeled({ label, children, style }: { label: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.labeled, style]}>
      {children}
      <Caption>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  demo: { marginBottom: space[3] },
  header: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[3], gap: 2 },
  bareHeader: { paddingTop: space[2], paddingBottom: space[3], gap: 2 },
  padded: { paddingHorizontal: space[4], paddingBottom: space[4] },
  edge: { paddingBottom: space[2] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  labeled: { gap: space[1] + 2, alignItems: 'flex-start' },
});
