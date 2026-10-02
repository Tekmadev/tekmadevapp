import { RotateCcw } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { BlackHole } from '@/loader/BlackHole';
import { PageLoader } from '@/loader/PageLoader';
import { useLoaderSettings } from '@/loader/settings';

import { delayCaption } from './logic';

type LoaderPreviewProps = {
  /** Bumped to remount the appear-delay demo, which plays the delay again. */
  replay: number;
  onReplay: () => void;
};

/** The page loader's size on this screen (brief 8.14). */
const HERO = 96;
const DELAY_WELL = 48;

/**
 * The live preview (brief 8.14), pinned under the header so it stays in view
 * while any slider below is dragged: the page loader at 96dp, two pending
 * buttons on the button beat, and the appear-delay demo. Every mark reads the
 * loader settings live (the screen previews the draft through the loader
 * store), so they react on the next frame, mid beat.
 */
export function LoaderPreview({ replay, onReplay }: LoaderPreviewProps) {
  const { colors } = useTheme();
  const { showAfterMs } = useLoaderSettings();

  return (
    <View style={[styles.pin, { backgroundColor: colors.bg }]}>
      <Card>
        <View style={styles.hero}>
          <View style={[styles.well, styles.heroWell, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
            <BlackHole size={HERO} accessibilityLabel="Page loader preview" />
          </View>
          {/* Samples only: not buttons anyone can press, so TalkBack skips them. */}
          <View style={styles.buttons} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Button label="Book a call" variant="secondary" size="sm" pending pendingLabel="Booking…" fullWidth />
            <Button label="Save changes" size="sm" pending pendingLabel="Saving" fullWidth />
          </View>
        </View>
        <Divider style={styles.divider} />
        <View style={styles.delay}>
          <View
            style={[styles.well, styles.delayWell, { backgroundColor: colors.bg2, borderColor: colors.line }]}
            accessible
            accessibilityLabel={`Appear delay demo. ${delayCaption(showAfterMs)}`}
          >
            <View style={styles.delayInner} importantForAccessibility="no-hide-descendants">
              <PageLoader key={replay} size={28} />
            </View>
          </View>
          <View style={styles.delayBody}>
            <Text variant="small" color="ink3" numberOfLines={2}>
              {delayCaption(showAfterMs)}
            </Text>
            <Button label="Replay the delay" variant="secondary" size="sm" icon={RotateCcw} onPress={onReplay} style={styles.replay} />
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  // Opaque edge to edge (it cancels the screen gutter), so the sliders scroll away under the pinned card.
  pin: { marginHorizontal: -layout.gutter, paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  well: { borderWidth: 1, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroWell: { width: HERO + space[6], height: HERO + space[6] },
  buttons: { flex: 1, gap: space[2] },
  divider: { marginVertical: space[3] },
  delay: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  delayWell: { width: DELAY_WELL + space[6], height: DELAY_WELL + space[6] },
  // PageLoader fills its box with 16dp padding around the mark; this box leaves room for both.
  delayInner: { width: DELAY_WELL + space[4], height: DELAY_WELL + space[4] },
  delayBody: { flex: 1, gap: space[2] },
  replay: { alignSelf: 'flex-start' },
});
