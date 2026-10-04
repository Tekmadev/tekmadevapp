import { ArrowLeft, Eye, PencilLine } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { Header } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { useTheme } from '@/design/theme';
import { layout, space, type Tone } from '@/design/tokens';
import { MAX_FONT_SCALE } from '@/design/typography';

export type EditorTopBarProps = {
  /** 0 showing, 1 slid away (quick return while scrolling down). */
  hidden: SharedValue<number>;
  /** 0 to 1: the compact title fades in once the title field has scrolled away. */
  collapse: SharedValue<number>;
  title: string;
  /** The status badge, or null when it shows under the title instead (see useBadgeFitsBar). */
  status: { label: string; tone: Tone } | null;
  previewing: boolean;
  /** The Preview / "Back to writing" button. Left out on the read-only post view (it is always the preview). */
  onTogglePreview?: () => void;
  onBack: () => void;
  /** The gold hairline (refetching, a status change running). */
  progress: boolean;
  /** Save, when this person may save (`blog.write`). */
  save?: ReactNode;
  menu: ReactNode;
};

/**
 * Whether the status badge fits in the bar next to back, Preview, "Save
 * changes" and the menu. On a narrow phone at a large font size it moves to the
 * line under the title instead, so nothing in the bar is ever cut off.
 */
export function useBadgeFitsBar(): boolean {
  const { width, fontScale } = useWindowDimensions();
  const scale = Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
  // Three 48dp buttons and gaps, plus the badge and the save button, which grow with the text.
  return width >= 150 + 200 * scale;
}

/** The space the bar takes at the top of the scroll content. */
export function useTopBarInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + layout.headerHeight;
}

/**
 * The editor's collapsing top bar: back, the status badge, the title once it
 * scrolls away, Preview, Save and the overflow menu. It slides up out of the
 * way while writing and comes back on the first scroll up; the status bar
 * strip above it stays put. The read-only post view uses it without Preview
 * and Save.
 */
export function EditorTopBar({
  hidden,
  collapse,
  title,
  status,
  previewing,
  onTogglePreview,
  onBack,
  progress,
  save,
  menu,
}: EditorTopBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: -hidden.get() * layout.headerHeight }] }));

  return (
    <>
      <Animated.View style={[styles.bar, { top: insets.top }, slide]}>
        <Header
          safeTop={false}
          headerLeft={
            <View style={styles.left}>
              <IconButton icon={ArrowLeft} accessibilityLabel="Back" onPress={onBack} color="ink" />
              {status ? <Badge label={status.label} tone={status.tone} style={styles.badge} /> : null}
            </View>
          }
          title={title}
          collapse={collapse}
          progress={progress}
          headerRight={
            <View style={styles.right}>
              {onTogglePreview ? (
                <IconButton
                  icon={previewing ? PencilLine : Eye}
                  accessibilityLabel={previewing ? 'Back to writing' : 'Preview'}
                  onPress={onTogglePreview}
                  color={previewing ? 'gold' : 'ink2'}
                />
              ) : null}
              {save ?? null}
              {menu}
            </View>
          }
        />
      </Animated.View>
      {/* Drawn after the bar so the bar slides under it. */}
      <View pointerEvents="none" style={[styles.statusStrip, { height: insets.top, backgroundColor: colors.bg }]} />
    </>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0 },
  left: { flexDirection: 'row', alignItems: 'center' },
  badge: { alignSelf: 'center', flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0 },
});
