import { Unplug } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

const TITLE = 'Meta is not connected';
const BODY =
  'Ads needs the Meta ad account id and an access token on the server. Once both are set, spend, clicks and what they brought in show here after the next sync.';

/** GET /ads said `connected: false`: no numbers at all (never zeros), just what is missing. */
export function NotConnectedCard() {
  const { tones } = useTheme();
  return (
    <Card accessibilityLabel={`${TITLE}. ${BODY}`}>
      <View style={styles.top} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.icon, { backgroundColor: tones.neutral.bg }]}>
          <Icon icon={Unplug} size={18} color="ink2" />
        </View>
        <Text variant="title" style={styles.title}>
          {TITLE}
        </Text>
      </View>
      <Text variant="body" color="ink2" style={styles.body} importantForAccessibility="no">
        {BODY}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  icon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  body: { marginTop: space[3] },
});
