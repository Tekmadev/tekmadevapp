import { FlashList, type FlashListProps, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { useScrollToTop } from 'expo-router';
import { isValidElement, useImperativeHandle, useRef, type ComponentType, type ReactElement, type ReactNode, type Ref } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { layout, space } from '@/design/tokens';

import { OfflineBanner } from './OfflineBanner';
import { GestureListScrollView } from './parts/ScrollGesture';
import { LargeTitle, ScreenFrame, useScreenChrome, type ScreenChromeProps, type ScreenHandle } from './parts/screenChrome';

type ListSlot = ComponentType | ReactElement | null;

/**
 * Animated FlashList for the Reanimated scroll handler. createAnimatedComponent
 * drops FlashList's item generic, so it is put back here, at this one boundary.
 */
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as unknown as <T>(
  props: Omit<FlashListProps<T>, 'onScroll'> & {
    onScroll?: ReturnType<typeof useScreenChrome>['onScroll'];
    ref?: Ref<FlashListRef<T>>;
  },
) => ReactElement;

export type ScreenListProps<T> = ScreenChromeProps & {
  data: readonly T[] | null | undefined;
  renderItem: ListRenderItem<T>;
  keyExtractor?: (item: T, index: number) => string;
  getItemType?: (item: T, index: number) => string | number | undefined;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  /** Rendered under the large title and offline banner, above the rows. */
  ListHeaderComponent?: ListSlot;
  ListEmptyComponent?: ListSlot;
  ListFooterComponent?: ListSlot;
  ItemSeparatorComponent?: ComponentType | null;
  /** Indices into `data` that stick under the header. */
  stickyHeaderIndices?: number[];
  /** Re-render rows when something outside `data` changes (selection, expanded row). */
  extraData?: unknown;
  /** 16dp side gutter on the title and header slots (rows bring their own padding). Default true. */
  paddedHeader?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Full FlashList access (scrollToIndex, prepareForLayoutAnimationRender). */
  listRef?: Ref<FlashListRef<T>>;
  ref?: Ref<ScreenHandle>;
};

function renderSlot(slot: ListSlot | undefined): ReactNode {
  if (!slot) return null;
  if (isValidElement(slot)) return slot;
  const Slot = slot;
  return <Slot />;
}

/**
 * The list version of Screen: the same header, large title, pull to refresh,
 * refetch hairline and offline banner, with a FlashList body. The title and
 * banner ride in the list header so they scroll away with the rows.
 */
export function ScreenList<T>({
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
  data,
  renderItem,
  keyExtractor,
  getItemType,
  onEndReached,
  onEndReachedThreshold,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  ItemSeparatorComponent,
  stickyHeaderIndices,
  extraData,
  paddedHeader = true,
  contentContainerStyle,
  listRef,
  ref,
}: ScreenListProps<T>) {
  const chrome = useScreenChrome({ title, eyebrow, subtitle, largeTitle, onRefresh, scrollY, tabBarInset });
  const { hasLargeTitle } = chrome;
  const list = useRef<FlashListRef<T> | null>(null);

  // The caller's listRef gets the same FlashList (attached before this layout effect runs).
  useImperativeHandle<FlashListRef<T> | null, FlashListRef<T> | null>(listRef, () => list.current, []);

  const scrollToY = (y: number, animated = true) => list.current?.scrollToOffset({ offset: y, animated });
  useImperativeHandle(ref, () => ({ scrollTo: scrollToY, scrollToTop: (animated = true) => scrollToY(0, animated) }));

  // Pressing the active tab scrolls back to the top.
  const tabTarget = useRef({ scrollToTop: () => list.current?.scrollToOffset({ offset: 0, animated: true }) });
  useScrollToTop(tabTarget);

  const gutter = paddedHeader ? styles.gutter : null;
  const header = (
    <View>
      <View onLayout={chrome.onTitleLayout} style={[gutter, { paddingTop: hasLargeTitle ? 0 : space[2] }]}>
        {hasLargeTitle ? <LargeTitle title={title} eyebrow={eyebrow} subtitle={subtitle} animatedStyle={chrome.titleStyle} /> : null}
      </View>
      {offlineBanner ? (
        <View style={gutter}>
          <OfflineBanner updatedAt={updatedAt} queryKey={queryKey} style={styles.banner} />
        </View>
      ) : null}
      {renderSlot(ListHeaderComponent)}
    </View>
  );

  // A spacer rather than content padding: it clears the floating tab bar on every FlashList version.
  const footer = (
    <View style={{ paddingBottom: chrome.bottomInset }}>
      {renderSlot(ListFooterComponent)}
    </View>
  );

  return (
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
      <AnimatedFlashList<T>
        ref={list}
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        ListHeaderComponent={header}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={footer}
        ItemSeparatorComponent={ItemSeparatorComponent}
        stickyHeaderIndices={stickyHeaderIndices}
        extraData={extraData}
        contentContainerStyle={contentContainerStyle}
        renderScrollComponent={GestureListScrollView}
        onScroll={chrome.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        overScrollMode={chrome.pull.enabled ? 'never' : 'auto'}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  banner: { marginBottom: space[4] },
});
