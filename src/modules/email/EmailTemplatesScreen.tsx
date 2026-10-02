import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { emailKeys, emailTemplatesQuery } from '@/api/endpoints/email';
import { MESSAGES } from '@/api/errors';
import type { EmailTemplate } from '@/api/schemas/email';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { TemplateListSkeleton } from './components/EmailSkeleton';

const EMPTY = 'No templates yet.';

const rowKey = (t: EmailTemplate) => t.key;
const openTemplate = (t: EmailTemplate) => router.push({ pathname: '/email/template/[key]', params: { key: t.key } });

type TemplateCardProps = { template: EmailTemplate; index: number; still: boolean };

/** Name, subject and the "use when" sentence; the whole card opens the template. */
const TemplateCard = memo(function TemplateCard({ template, index, still }: TemplateCardProps) {
  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)} style={styles.wrap}>
      <Card
        onPress={() => openTemplate(template)}
        accessibilityLabel={`${template.name}. Subject: ${template.subject}. Use when: ${template.useWhen}`}
        accessibilityHint="Opens the preview and the HTML"
      >
        <View importantForAccessibility="no-hide-descendants" style={styles.card}>
          <View style={styles.top}>
            <Text variant="title" numberOfLines={2} style={styles.name}>
              {template.name}
            </Text>
            <Text variant="mono" color="ink4" numberOfLines={1} style={styles.key}>
              {template.key}
            </Text>
          </View>
          <Text variant="body" color="ink2" numberOfLines={2}>
            {template.subject}
          </Text>
          <View style={styles.useWhen}>
            <Text variant="eyebrow">Use when</Text>
            <Text variant="small" color="ink3">
              {template.useWhen}
            </Text>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
});

/**
 * Email templates (brief 8.11, GET /email/templates): the gallery of
 * ready-made marketing emails, each with its name, subject and "use when"
 * sentence. A card opens the preview, the exact HTML and the campaign key.
 */
export function EmailTemplatesScreen() {
  return (
    <OwnerOnly>
      <TemplatesBody />
    </OwnerOnly>
  );
}

function TemplatesBody() {
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const query = useQuery(emailTemplatesQuery());
  useRefreshOnFocus([emailKeys.templates()]);

  const pausedWithoutData = query.isPending && query.fetchStatus === 'paused';
  const rows = query.data ?? [];

  const renderItem = ({ item, index }: ListRenderItemInfo<EmailTemplate>) => (
    <TemplateCard template={item} index={index} still={reduceMotion} />
  );

  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} style={styles.gutter} />
  ) : query.isPending ? (
    <TemplateListSkeleton />
  ) : query.isError && !query.data ? (
    <ErrorState error={query.error} onRetry={() => query.refetch()} style={styles.gutter} />
  ) : (
    <EmptyState message={EMPTY} style={styles.gutter} />
  );

  const header =
    query.isRefetchError && query.data && online ? (
      <View style={styles.gutter}>
        <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} />
      </View>
    ) : (
      <View style={styles.intro}>
        <Text variant="body" color="ink3">
          Copy one into the CRM as a Custom HTML block. Its tracking pixel and links already carry the campaign key.
        </Text>
      </View>
    );

  return (
    <ScreenList<EmailTemplate>
      title="Templates"
      back
      data={rows}
      renderItem={renderItem}
      keyExtractor={rowKey}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={<View style={styles.footer} />}
      onRefresh={() => query.refetch()}
      refetching={query.isFetching && query.data !== undefined}
      queryKey={emailKeys.templates()}
    />
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  intro: { paddingHorizontal: layout.gutter, paddingBottom: space[4] },
  refetchError: { marginBottom: space[4] },
  wrap: { paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  card: { gap: space[2] },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  name: { flex: 1 },
  key: { flexShrink: 1, maxWidth: '45%', marginTop: 3 },
  useWhen: { gap: space[1], marginTop: space[1] },
  footer: { height: space[6] },
});
