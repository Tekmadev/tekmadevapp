import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Copy } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { emailKeys, emailTemplatesQuery } from '@/api/endpoints/email';
import { MESSAGES } from '@/api/errors';
import type { EmailTemplate } from '@/api/schemas/email';
import { RequireCapability } from '@/auth/RequireCapability';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PressableScale } from '@/components/PressableScale';
import { SegmentedControl, type SegmentItem } from '@/components/SegmentedControl';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { TemplateDetailSkeleton } from './components/EmailSkeleton';
import { TemplatePreview } from './components/TemplatePreview';
import { copyExact } from './copy';
import { EMAIL_COPY } from './logic';

type Tab = 'preview' | 'code';
const TABS: readonly SegmentItem<Tab>[] = [
  { value: 'preview', label: 'Preview' },
  { value: 'code', label: 'Code' },
];

const oneParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || '';

/**
 * One email template (brief 8.11): Preview (a WebView with JavaScript off,
 * rendering `previewHtml`) and Code (the exact `html`), the campaign key, and
 * "Copy HTML", which copies `html` byte for byte so the `{{contact.first_name}}`
 * and `{{unsubscribe}}` merge tags reach the CRM untouched.
 */
export function EmailTemplateScreen() {
  return (
    <RequireCapability cap="email.view">
      <TemplateBody />
    </RequireCapability>
  );
}

function TemplateBody() {
  const params = useLocalSearchParams<{ key: string }>();
  const key = oneParam(params.key);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const [tab, setTab] = useState<Tab>('preview');

  // The gallery already holds every template, so this opens from the cache at once.
  const query = useQuery(emailTemplatesQuery());
  useRefreshOnFocus([emailKeys.templates()]);
  const template = query.data?.find((t) => t.key === key);

  let body: ReactNode;
  if (template) {
    body = <TemplateView template={template} tab={tab} onTab={setTab} bottomInset={insets.bottom} />;
  } else if (query.data) {
    body = <ErrorState message={MESSAGES.notFound} style={styles.state} />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => query.refetch()} style={styles.state} />;
  } else if (query.fetchStatus === 'paused') {
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} style={styles.state} />;
  } else {
    body = (
      <View style={styles.state}>
        <TemplateDetailSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <Header title={template?.name ?? 'Template'} back bordered progress={query.isFetching && query.data !== undefined} />
      <OfflineBanner queryKey={emailKeys.templates()} style={styles.banner} />
      {body}
    </View>
  );
}

type TemplateViewProps = {
  template: EmailTemplate;
  tab: Tab;
  onTab: (tab: Tab) => void;
  bottomInset: number;
};

function TemplateView({ template, tab, onTab, bottomInset }: TemplateViewProps) {
  const { colors } = useTheme();
  // The WebView mounts once and stays (switching tabs never reloads it); the code mounts on first visit.
  const [codeSeen, setCodeSeen] = useState(tab === 'code');
  if (tab === 'code' && !codeSeen) setCodeSeen(true);

  return (
    <View style={styles.fill}>
      <View style={styles.top}>
        <Text variant="small" color="ink3" numberOfLines={2}>
          Subject: {template.subject}
        </Text>
        <SegmentedControl items={TABS} value={tab} onChange={onTab} accessibilityLabel="Template view" />
      </View>

      <View style={[styles.fill, { borderColor: colors.line }, styles.frame]}>
        <View style={[styles.fill, tab === 'preview' ? null : styles.hidden]}>
          <TemplatePreview html={template.previewHtml} name={template.name} />
        </View>
        {codeSeen ? (
          <ScrollView style={[styles.fill, tab === 'code' ? null : styles.hidden]} contentContainerStyle={styles.code}>
            <Text variant="mono" color="ink2" selectable>
              {template.html}
            </Text>
          </ScrollView>
        ) : null}
      </View>

      <View style={[styles.bottom, { borderTopColor: colors.line, backgroundColor: colors.bg, paddingBottom: bottomInset + space[3] }]}>
        <PressableScale
          onPress={() => void copyExact(template.key)}
          style={styles.keyRow}
          accessibilityRole="button"
          accessibilityLabel={`Campaign key ${template.key}`}
          accessibilityHint="Copies the key"
        >
          <Text variant="eyebrow">Campaign key</Text>
          <Text variant="mono" numberOfLines={1} style={styles.keyText}>
            {template.key}
          </Text>
          <Icon icon={Copy} size={16} color="ink3" />
        </PressableScale>
        <Button
          label="Copy HTML"
          icon={Copy}
          fullWidth
          accessibilityHint="Copies the exact HTML, merge tags included"
          onPress={() => void copyExact(template.html, 'HTML copied.')}
        />
        <Text variant="small" color="ink3" align="center">
          {EMAIL_COPY.templateHint}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
  banner: { marginHorizontal: layout.gutter, marginTop: space[3] },
  state: { paddingHorizontal: layout.gutter, paddingTop: space[4] },
  top: { paddingHorizontal: layout.gutter, paddingTop: space[3], paddingBottom: space[3], gap: space[3] },
  frame: { borderTopWidth: 1 },
  code: { padding: layout.gutter },
  bottom: { paddingHorizontal: layout.gutter, paddingTop: space[2], gap: space[2], borderTopWidth: 1 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: layout.minTouch },
  keyText: { flex: 1 },
});
