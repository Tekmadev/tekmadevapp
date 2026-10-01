import { Moon, Sun } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { Screen, type ScreenHandle } from '@/components/Screen';
import { SegmentedControl, type SegmentItem } from '@/components/SegmentedControl';
import { Text } from '@/components/Text';
import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { usePrefs, type ThemePreference } from '@/lib/prefs';
import { BootSplash } from '@/loader/BootSplash';

import { JumpRow } from './JumpRow';
import { KitScrollContext, KitSection } from './kitLayout';
import { anchorDelta, jumpTarget, KIT_SECTIONS, UNMEASURED, type KitSectionId } from './kitSections';
import { delay } from './sampleData';
import { AutomationDemos } from './sections/AutomationSection';
import { BadgesDemos } from './sections/BadgesSection';
import { ButtonsDemos } from './sections/ButtonsSection';
import { CardsDemos } from './sections/CardsSection';
import { ChartsDemos } from './sections/ChartsSection';
import { ColoursDemos } from './sections/ColoursSection';
import { FormsDemos } from './sections/FormsSection';
import { LoaderDemos } from './sections/LoaderSection';
import { MockApiDemos } from './sections/MockApiSection';
import { QrDemos } from './sections/QrSection';
import { SheetsDemos } from './sections/SheetsSection';
import { StatesDemos } from './sections/StatesSection';
import { ToastsDemos } from './sections/ToastsSection';
import { TypographyDemos } from './sections/TypographySection';

const THEMES: readonly SegmentItem<ThemePreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Sections mounted only when you scroll near them (many inputs, Skia canvases,
 * running animations), with a rough height to hold until then. A wrong guess
 * only matters while it is above you, and the screen corrects for that.
 */
const LAZY: Partial<Record<KitSectionId, number>> = {
  cards: 3600,
  states: 2000,
  forms: 7000,
  charts: 1500,
  automation: 2400,
  qr: 800,
};

/** A generous upper bound on Android's smooth scroll, which has no completion callback. */
const JUMP_GLIDE_MS = 900;
/** How long the boot splash replay waits before it is "ready" (it beats until then). */
const SPLASH_WAIT_MS = 1800;
/** Space between the theme card and the sticky "Jump to" row. */
const THEME_BLOCK_GAP = space[4];

/** How long a pull on the Kit screen "loads" for. */
const REFRESH_MS = 1600;
const pretendRefresh = () => delay(REFRESH_MS);

/** The boot splash replay: null when not showing. */
type SplashState = { ready: boolean } | null;

type LoaderControls = { refetching: boolean; onRefetchingChange: (on: boolean) => void; onReplaySplash: () => void };

function KitDemos({ id, ...loader }: LoaderControls & { id: KitSectionId }): ReactNode {
  switch (id) {
    case 'type':
      return <TypographyDemos />;
    case 'colours':
      return <ColoursDemos />;
    case 'loader':
      return <LoaderDemos {...loader} />;
    case 'buttons':
      return <ButtonsDemos />;
    case 'badges':
      return <BadgesDemos />;
    case 'cards':
      return <CardsDemos />;
    case 'states':
      return <StatesDemos />;
    case 'sheets':
      return <SheetsDemos />;
    case 'toasts':
      return <ToastsDemos />;
    case 'forms':
      return <FormsDemos />;
    case 'charts':
      return <ChartsDemos />;
    case 'automation':
      return <AutomationDemos />;
    case 'qr':
      return <QrDemos />;
    case 'mock':
      return <MockApiDemos />;
  }
}

/**
 * The hidden Kit screen (Settings, About, tap the version 7 times): every
 * component in every state, in both themes. It is the acceptance gate for the
 * design system, so it uses only the real components, never look-alikes.
 *
 * The theme flips instantly from the header (sun and moon) or the System /
 * Light / Dark control. "Jump to" sticks under the header and follows the
 * scroll. The heavier sections mount when you scroll near them, and demos with
 * animated canvases unmount while far off screen, so the screen stays smooth.
 */
export function KitScreen() {
  const { colors, isDark, scheme } = useTheme();
  const themePreference = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();

  const screenRef = useRef<ScreenHandle>(null);
  const scrollY = useSharedValue(0);
  const offsets = useSharedValue<number[]>(KIT_SECTIONS.map(() => UNMEASURED));
  const stickyTop = useSharedValue(UNMEASURED);
  const stickyHeight = useSharedValue(0);
  // True while a jump glides: the scroll spy and lazy mounting wait for it to land.
  const jumping = useSharedValue(false);
  const layouts = useRef(new Map<KitSectionId, { top: number; height: number }>());
  const glideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<{ delta: number; frame: number | null }>({ delta: 0, frame: null });

  const [refetching, setRefetching] = useState(false);
  const [splash, setSplash] = useState<SplashState>(null);

  useEffect(
    () => () => {
      if (glideTimer.current) clearTimeout(glideTimer.current);
      if (splashTimer.current) clearTimeout(splashTimer.current);
      if (anchor.current.frame !== null) cancelAnimationFrame(anchor.current.frame);
    },
    [],
  );

  const onMeasure = useCallback(
    (id: KitSectionId, top: number, height: number) => {
      const previous = layouts.current.get(id);
      layouts.current.set(id, { top, height });
      offsets.set(KIT_SECTIONS.map((s) => layouts.current.get(s.id)?.top ?? UNMEASURED));
      // A section above the reader changed height (a lazy one mounted): keep what is on
      // screen still. Several can land in one layout pass, while the scroll offset still
      // reads the old value, so their changes add up and are applied once, next frame.
      const delta = previous ? anchorDelta(previous, height, scrollY.get(), stickyHeight.get()) : 0;
      if (delta === 0) return;
      anchor.current.delta += delta;
      if (anchor.current.frame !== null) return;
      anchor.current.frame = requestAnimationFrame(() => {
        const total = anchor.current.delta;
        anchor.current = { delta: 0, frame: null };
        screenRef.current?.scrollTo(Math.max(0, scrollY.get() + total), false);
      });
    },
    [offsets, scrollY, stickyHeight],
  );

  const onJump = useCallback(
    (id: KitSectionId) => {
      const section = layouts.current.get(id);
      if (!section) return;
      jumping.set(true);
      if (glideTimer.current) clearTimeout(glideTimer.current);
      glideTimer.current = setTimeout(() => jumping.set(false), reduceMotion ? 0 : JUMP_GLIDE_MS);
      screenRef.current?.scrollTo(jumpTarget(section.top, stickyHeight.get()), !reduceMotion);
    },
    [reduceMotion, jumping, stickyHeight],
  );

  const replaySplash = useCallback(() => {
    if (splashTimer.current) clearTimeout(splashTimer.current);
    setSplash({ ready: false });
    splashTimer.current = setTimeout(() => setSplash((s) => (s ? { ready: true } : s)), SPLASH_WAIT_MS);
  }, []);

  const scrollContext = useMemo(() => ({ scrollY, viewport: windowHeight, paused: jumping }), [scrollY, windowHeight, jumping]);

  // Built once (and again only when the loader demo's switch changes), so a theme
  // flip re-renders the components that read the theme and nothing else.
  const sections = useMemo(
    () =>
      KIT_SECTIONS.map((meta, index) => {
        const estimate = LAZY[meta.id];
        return (
          <KitSection
            key={meta.id}
            id={meta.id}
            index={index}
            title={meta.label}
            lazy={estimate !== undefined}
            estimatedHeight={estimate}
            onMeasure={onMeasure}
          >
            <KitDemos id={meta.id} refetching={refetching} onRefetchingChange={setRefetching} onReplaySplash={replaySplash} />
          </KitSection>
        );
      }),
    [onMeasure, refetching, replaySplash],
  );

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <KitScrollContext value={scrollContext}>
        <Screen
          ref={screenRef}
          title="Kit"
          eyebrow="DESIGN SYSTEM"
          subtitle="Every component, every state."
          back
          keyboardAware
          scrollY={scrollY}
          // The real pull to refresh, on this screen: nothing to reload, so it just beats a while.
          onRefresh={pretendRefresh}
          refetching={refetching}
          stickyHeaderIndices={[1]}
          headerRight={
            <IconButton
              icon={isDark ? Sun : Moon}
              accessibilityLabel={isDark ? 'Switch to the light theme' : 'Switch to the dark theme'}
              onPress={() => setTheme(isDark ? 'light' : 'dark')}
            />
          }
        >
          <View
            style={styles.themeBlock}
            onLayout={(e) => {
              // A sticky child's own layout y is relative to the wrapper ScrollView puts around
              // it, so where the jump row starts is measured from this block instead.
              const { y, height } = e.nativeEvent.layout;
              stickyTop.set(y + height + THEME_BLOCK_GAP);
            }}
          >
            <Card style={styles.themeCard}>
              <Text variant="label" color="ink2">
                Theme
              </Text>
              <SegmentedControl items={THEMES} value={themePreference} onChange={setTheme} accessibilityLabel="Theme" />
              <Text variant="small" color="ink3">
                {`Showing the ${scheme} theme. The ${isDark ? 'sun' : 'moon'} in the header flips it from anywhere.`}
              </Text>
            </Card>
          </View>

          <JumpRow
            scrollY={scrollY}
            offsets={offsets}
            stickyTop={stickyTop}
            stickyHeight={stickyHeight}
            jumping={jumping}
            probe={Math.round(windowHeight * 0.3)}
            onJump={onJump}
          />

          {sections}
        </Screen>
      </KitScrollContext>

      {splash ? <BootSplash ready={splash.ready} exitTo="center" onFinish={() => setSplash(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  themeBlock: { marginBottom: THEME_BLOCK_GAP },
  themeCard: { gap: space[3] },
});
