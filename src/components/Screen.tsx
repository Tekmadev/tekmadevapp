import { useScrollToTop } from 'expo-router';
import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { layout, space } from '@/design/tokens';

import { OfflineBanner } from './OfflineBanner';
import { GutterContext } from './parts/gutter';
import { GestureAnimatedScrollView } from './parts/ScrollGesture';
import { LargeTitle, ScreenFrame, useScreenChrome, type ScreenChromeProps, type ScreenHandle } from './parts/screenChrome';

export type { ScreenChromeProps, ScreenHandle } from './parts/screenChrome';

export type ScreenProps = ScreenChromeProps & {
  children?: ReactNode;
  /** 16dp side gutter on the content (default true). */
  padded?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Forms: keeps the focused input above the keyboard. */
  keyboardAware?: boolean;
  /**
   * Indices into this screen's own children that stick under the header (section
   * tabs). Pass children as separate elements, not one fragment, for this to work.
   */
  stickyHeaderIndices?: number[];
  ref?: Ref<ScreenHandle>;
};

/** Elements Screen renders before the caller's children (title block, offline banner). */
const OWN_CHILDREN = 2;

/**
 * The screen shell: edge to edge, a large title that collapses into the header
 * as you scroll, pull to refresh with the black hole, the refetch hairline, the
 * offline banner, and bottom padding that clears the floating tab bar.
 */
export function Screen({
  title,
  eyebrow,
  subtitle,
  largeTitle = true,
  back,
  onBack,
  headerLeft,
  headerRight,
  onRefresh,
  refetching = false,
  offlineBanner = true,
  updatedAt,
  queryKey,
  tabBarInset,
  scrollY,
  style,
  testID,
  children,
  padded = true,
  contentContainerStyle,
  keyboardAware = false,
  stickyHeaderIndices,
  ref,
}: ScreenProps) {
  const chrome = useScreenChrome({ title, eyebrow, subtitle, largeTitle, onRefresh, scrollY, tabBarInset });
  const { scrollRef, hasLargeTitle } = chrome;

  const scrollToY = (y: number, animated = true) => scrollRef.current?.scrollTo({ y, animated });
  useImperativeHandle(ref, () => ({ scrollTo: scrollToY, scrollToTop: (animated = true) => scrollToY(0, animated) }));

  // Pressing the active tab scrolls back to the top.
  const tabTarget = useRef({ scrollToTop: () => scrollRef.current?.scrollTo({ y: 0, animated: true }) });
  useScrollToTop(tabTarget);

  const gutter = padded ? null : styles.gutter;
  const scrollProps = {
    onScroll: chrome.onScroll,
    scrollEventThrottle: 16,
    keyboardShouldPersistTaps: 'handled' as const,
    showsVerticalScrollIndicator: false,
    // The pull replaces Android's stretch at the top; both at once would fight.
    overScrollMode: chrome.pull.enabled ? ('never' as const) : ('auto' as const),
    stickyHeaderIndices: stickyHeaderIndices?.map((i) => i + OWN_CHILDREN),
    contentContainerStyle: [
      padded ? styles.gutter : null,
      { paddingTop: hasLargeTitle ? 0 : space[2], paddingBottom: chrome.bottomInset },
      contentContainerStyle,
    ],
  };

  // Separate children (not a fragment) so sticky header indices line up.
  const titleBlock = (
    <View key="__title" onLayout={chrome.onTitleLayout} style={gutter}>
      {hasLargeTitle ? <LargeTitle title={title} eyebrow={eyebrow} subtitle={subtitle} animatedStyle={chrome.titleStyle} /> : null}
    </View>
  );
  const banner = (
    <View key="__banner" style={gutter}>
      {offlineBanner ? <OfflineBanner updatedAt={updatedAt} queryKey={queryKey} style={styles.banner} /> : null}
    </View>
  );

  return (
    <GutterContext value={padded ? layout.gutter : 0}>
      <ScreenFrame
        chrome={chrome}
        title={title}
        eyebrow={eyebrow}
        back={back}
        onBack={onBack}
        headerLeft={headerLeft}
        headerRight={headerRight}
        refetching={refetching}
        style={style}
        testID={testID}
      >
        {keyboardAware ? (
          <KeyboardAwareScrollView ScrollViewComponent={GestureAnimatedScrollView} bottomOffset={space[6]} {...scrollProps}>
            {titleBlock}
            {banner}
            {children}
          </KeyboardAwareScrollView>
        ) : (
          <GestureAnimatedScrollView {...scrollProps}>
            {titleBlock}
            {banner}
            {children}
          </GestureAnimatedScrollView>
        )}
      </ScreenFrame>
    </GutterContext>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  banner: { marginBottom: space[4] },
});
