import * as Clipboard from 'expo-clipboard';
import { Copy, Mail } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import type { ToolSubmission } from '@/api/schemas/tools';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { contactUrl } from '@/components/parts/logic';
import { space } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { businessLine, emailLine } from '../logic';

async function copy(value: string) {
  try {
    await Clipboard.setStringAsync(value);
    notice.ok('Copied.');
  } catch {
    notice.err('Could not copy that.');
  }
}

function writeTo(email: string) {
  const url = contactUrl('email', email);
  if (!url) {
    void copy(email);
    return;
  }
  // No mail app: the address goes to the clipboard instead, so the tap is never lost.
  Linking.openURL(url).catch(() => void copy(email));
}

export type SubmissionContactProps = {
  row: ToolSubmission;
};

/**
 * Under the large title (the person's name): their business and email, when
 * they submitted, then the contact actions: Email (opens the mail app) and
 * Copy email. Built from the row alone, so it shows from the list's cache
 * before the detail loads.
 */
export function SubmissionContact({ row }: SubmissionContactProps) {
  const business = businessLine(row);
  const email = emailLine(row);

  return (
    <View style={styles.wrap}>
      <View style={styles.lines}>
        {business ? (
          <Text variant="body" color="ink2">
            {business}
          </Text>
        ) : null}
        {email ? (
          <Text variant="body" color="ink3" selectable>
            {email}
          </Text>
        ) : null}
        <Text variant="small" color="ink3">
          {`Submitted ${formatDateTime(row.createdAt)}`}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Email"
          icon={Mail}
          variant="secondary"
          accessibilityLabel={`Email ${row.email}`}
          accessibilityHint="Opens your mail app"
          onPress={() => writeTo(row.email)}
          style={styles.action}
        />
        <Button
          label="Copy email"
          icon={Copy}
          variant="secondary"
          accessibilityHint="Copies the email address"
          onPress={() => void copy(row.email)}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[4], marginBottom: space[5] },
  lines: { gap: space[1] },
  // Side by side when they fit; at large font sizes they wrap onto a second line.
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space[3] },
  action: { flexGrow: 1 },
});
