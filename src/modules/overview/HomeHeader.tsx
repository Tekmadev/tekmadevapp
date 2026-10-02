import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Me } from '@/api/schemas/session';
import { Avatar } from '@/components/Avatar';
import { Grain } from '@/components/Grain';
import { PressableScale } from '@/components/PressableScale';
import { layout, space } from '@/design/tokens';
import { TabHeaderActions } from '@/modules/shell/TabHeaderActions';

/** Search, the Inbox bell, then the avatar that opens Profile. */
export function HomeHeaderRight({ me }: { me: Me | null }) {
  return (
    <View style={styles.right}>
      <TabHeaderActions />
      <PressableScale
        accessibilityLabel="Profile"
        accessibilityHint="Opens your profile"
        onPress={() => router.push('/profile')}
        style={styles.avatarTarget}
      >
        <Avatar name={me?.user.name || me?.user.email} size="sm" />
      </PressableScale>
    </View>
  );
}

/**
 * The film grain over the Home header bar (brief 6: splash, sign-in and the
 * Home header). It sits above the header (the header paints its own opaque
 * background) and ignores touches. The large title below it gets the same
 * grain from `TitleGrain`, which scrolls away with the title.
 */
export function HeaderGrain() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.headerGrain, { height: insets.top + layout.headerHeight }]}>
      <Grain />
    </View>
  );
}

/**
 * Grain behind the large title block, placed as the first child of the scroll
 * content so it moves with the title. `height` is where Home's own content
 * starts (measured), so the cards below never get grain.
 */
export function TitleGrain({ height }: { height: number }) {
  if (height <= 0) return null;
  return (
    // Negative sides reach the screen edges past the content gutter; the scroll view clips the excess.
    <View pointerEvents="none" style={[styles.titleGrain, { height }]}>
      <Grain />
    </View>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center' },
  avatarTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: space[1] },
  headerGrain: { position: 'absolute', top: 0, left: 0, right: 0 },
  titleGrain: { position: 'absolute', top: 0, left: -layout.gutter, right: -layout.gutter },
});
