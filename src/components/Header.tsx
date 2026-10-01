import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { TopProgress } from '@/loader/TopProgress';

import { IconButton } from './IconButton';
import { Text } from './Text';

export type HeaderProps = {
  title?: string;
  /** Small mono line above the title. */
  eyebrow?: string;
  /** Shows a back button (router.back(), or Home when there is no history). */
  back?: boolean;
  /** Override what the back button does. */
  onBack?: () => void;
  /** Replaces the back button slot (an avatar, a close button). */
  headerLeft?: ReactNode;
  /** Actions on the right (IconButtons: search, overflow). */
  headerRight?: ReactNode;
  /** The 2dp gold hairline at the bottom edge while the screen refetches. */
  progress?: boolean;
  /**
   * 0 (large title showing in the content) to 1 (collapsed). Drives the compact
   * title and the bottom hairline. Without it the title always shows.
   */
  collapse?: SharedValue<number>;
  /** 0 to 1: the bottom hairline on its own (content scrolled under a header without a large title). */
  hairline?: SharedValue<number>;
  /** Static bottom hairline (when there is no `collapse` or `hairline` value). */
  bordered?: boolean;
  /** Pad for the status bar (default true: the header is the top of the screen). */
  safeTop?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Leaves the screen: back when there is history, otherwise Home (deep link entry). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * The compact top app bar: back, title (17sp, left aligned like Android),
 * actions, and the top progress hairline. Screen uses it internally; pushed
 * screens without a large title can use it on its own.
 */
export function Header({
  title,
  eyebrow,
  back,
  onBack,
  headerLeft,
  headerRight,
  progress = false,
  collapse,
  hairline,
  bordered = false,
  safeTop = true,
  style,
}: HeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const titleStyle = useAnimatedStyle(() => {
    if (!collapse) return { opacity: 1, transform: [{ translateY: 0 }] };
    const c = collapse.get();
    return { opacity: c, transform: [{ translateY: (1 - c) * 6 }] };
  });
  const borderStyle = useAnimatedStyle(() => ({
    opacity: hairline ? hairline.get() : collapse ? collapse.get() : bordered ? 1 : 0,
  }));

  const left = headerLeft ?? (back ? <IconButton icon={ArrowLeft} accessibilityLabel="Back" onPress={onBack ?? goBack} color="ink" /> : null);

  return (
    <View style={[{ paddingTop: safeTop ? insets.top : 0, backgroundColor: colors.bg }, style]}>
      <View style={styles.row}>
        {left ? <View style={styles.left}>{left}</View> : null}
        <Animated.View
          style={[styles.titleBox, { paddingLeft: left ? space[1] : layout.gutter }, titleStyle]}
          // While the large title is visible it is the heading TalkBack reads, not this one.
          importantForAccessibility={collapse ? 'no-hide-descendants' : 'auto'}
        >
          {eyebrow ? (
            <Text variant="eyebrow" numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          {title ? (
            <Text variant="title" numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
        </Animated.View>
        {headerRight ? <View style={styles.right}>{headerRight}</View> : null}
      </View>
      <Animated.View pointerEvents="none" style={[styles.hairline, { backgroundColor: colors.line }, borderStyle]} />
      <View pointerEvents="none" style={styles.progress}>
        <TopProgress active={progress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: { paddingLeft: space[1] },
  titleBox: { flex: 1, justifyContent: 'center', paddingRight: space[2] },
  right: { flexDirection: 'row', alignItems: 'center', paddingRight: space[1] },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
});
