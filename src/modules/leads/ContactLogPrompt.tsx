import { X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { enterPull } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { TOUCH_KIND_ICONS } from './TouchTimeline';
import { CONTACT_PROMPTS, type ContactChannel } from './outreach';

export type ContactLogPromptProps = {
  channel: ContactChannel;
  /** The lead's first name ("Olivia"), or its title. */
  name: string;
  onLog: () => void;
  onDismiss: () => void;
};

/**
 * After Call, Email or Text opened its app: "Called Olivia? Log it while it is
 * fresh." with "Log this call", which opens Log outreach with the kind (and,
 * for a text, a note) filled in. It stays until it is used or dismissed, so it
 * is still there when the person comes back from the call.
 */
export function ContactLogPrompt({ channel, name, onLog, onDismiss }: ContactLogPromptProps) {
  const { colors } = useTheme();
  const prompt = CONTACT_PROMPTS[channel];
  return (
    <Animated.View
      entering={enterPull(0)}
      style={[styles.card, { backgroundColor: colors.goldTint, borderColor: colors.gold }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.top}>
        <Text variant="bodyStrong" style={styles.question}>
          {prompt.question(name)}
        </Text>
        <IconButton icon={X} size={20} accessibilityLabel="Dismiss" accessibilityHint="Hides this without logging" onPress={onDismiss} />
      </View>
      <Button label={prompt.action} icon={TOUCH_KIND_ICONS[prompt.kind]} size="sm" onPress={onLog} style={styles.button} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, paddingLeft: space[4], paddingRight: space[1], paddingVertical: space[3], gap: space[2] },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  question: { flex: 1 },
  button: { alignSelf: 'flex-start' },
});
