import { ExternalLink } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { CrmApp, CrmMeta, CrmMergeField } from '@/api/schemas/crm';
import { openInBrowser } from '@/components/automation/ApprovalBlocks';
import { isSafeHref } from '@/components/automation/markdown';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { KeyValue } from '@/components/KeyValue';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';

import { appBadge, DEFAULT_INSTALL_URL, mergeTag } from '../logic';

/**
 * The webhook app: installed on our account, on another account, or not
 * installed. Installing is a browser flow on the website's CRM page, opened
 * in a Custom Tab (Safari view on iOS).
 */
export function AppCard({ app, meta }: { app: CrmApp; meta: Partial<CrmMeta> | undefined }) {
  const { colors } = useTheme();
  const badge = appBadge(meta, app.status);
  const url = app.installUrl && isSafeHref(app.installUrl) ? app.installUrl : DEFAULT_INSTALL_URL;

  return (
    <Card style={styles.card}>
      <View accessible accessibilityLabel={`${badge.label}. ${app.explanation}`} style={styles.status}>
        <Badge label={badge.label} tone={badge.tone} dot size="md" style={styles.badge} />
        <Text variant="body" color="ink2" importantForAccessibility="no">
          {app.explanation}
        </Text>
      </View>
      {app.status !== 'installed_here' ? (
        <Button
          label="Install in the browser"
          icon={ExternalLink}
          variant="secondary"
          size="sm"
          onPress={() => openInBrowser(url, colors)}
          accessibilityHint="Opens the website's CRM page, where the app is installed"
          style={styles.button}
        />
      ) : null}
    </Card>
  );
}

/** The 12 merge fields with their `{{contact.<key>}}` tag. Tap a row to copy the tag. */
export function MergeFieldsCard({ fields }: { fields: readonly CrmMergeField[] }) {
  return (
    <Card padded={false}>
      <KeyValue items={fields.map((f) => ({ label: f.label, value: mergeTag(f.key), copyable: true, mono: true }))} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  status: { gap: space[2] },
  badge: { alignSelf: 'flex-start' },
  button: { alignSelf: 'flex-start' },
});
