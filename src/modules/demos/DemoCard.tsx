import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MonitorSmartphone } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { demoCardQuery, demoKeys, type DemoTarget } from '@/api/endpoints/demos';
import { MESSAGES } from '@/api/errors';
import type { DemoRequest } from '@/api/schemas/demos';
import { useCan } from '@/auth/permissions';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { ErrorState } from '@/components/ErrorState';
import { ListRow } from '@/components/ListRow';
import { Section } from '@/components/Section';
import { SkeletonList, useShowAfter } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { relativeTime } from '@/lib/dates';
import { useMinuteClock, useRefetchOnFocus } from '@/modules/overview/hooks';

import { demoStatusBadge, neededByBadge, personName } from './labels';

export type DemoCardProps = {
  target: DemoTarget;
  /** Filled in on "Request a demo". */
  businessName?: string | null;
  area?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** "Ready to show · Noah Lavoie · 2 h ago · Needed tomorrow" */
function rowMeta(d: DemoRequest, now: Date): string {
  const needed = neededByBadge(d.neededBy, d.status, now);
  return [personName(d.requestedBy, d.requestedByName), relativeTime(d.createdAt, now), needed?.label].filter(Boolean).join(' · ');
}

/**
 * The Demo card on a client and on a lead (contract 2026-10-05): their demo
 * requests, newest first and in every status (GET /demos?clientId= or
 * ?leadId=&status=all), each opening the request, and "Request a demo" for
 * people with `demos.request` (the form opens with this client or lead and
 * the business name filled in). Needs `demos.view` to list; a failed read is
 * an ErrorState with Retry, never "no requests".
 */
export function DemoCard({ target, businessName, area, style }: DemoCardProps) {
  const canView = useCan('demos.view');
  const canRequest = useCan('demos.request');
  if (!canView && !canRequest) return null;
  return <DemoCardBody target={target} businessName={businessName} area={area} style={style} canView={canView} canRequest={canRequest} />;
}

function DemoCardBody({ target, businessName, area, style, canView, canRequest }: DemoCardProps & { canView: boolean; canRequest: boolean }) {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const showSkeleton = useShowAfter();
  const now = useMinuteClock();
  const query = useQuery({ ...demoCardQuery(target), enabled: canView });
  useRefetchOnFocus((options) => (canView ? query.refetch(options) : undefined), query.dataUpdatedAt);

  const request = () => {
    const params: Record<string, string> = target.clientId ? { clientId: target.clientId } : { leadId: target.leadId ?? '' };
    if (businessName?.trim()) params.businessName = businessName.trim();
    if (area?.trim()) params.area = area.trim();
    router.push({ pathname: '/demos/new', params });
  };

  const open = (d: DemoRequest) => {
    if (queryClient.getQueryData(demoKeys.detail(d.id)) === undefined) queryClient.setQueryData(demoKeys.detail(d.id), d, { updatedAt: 0 });
    router.push({ pathname: '/demos/[id]', params: { id: d.id } });
  };

  const items = query.data?.items ?? [];
  const more = query.data?.nextCursor != null;

  let content = null;
  if (!canView) {
    content = null;
  } else if (query.data) {
    content =
      items.length === 0 ? (
        <Text variant="small" color="ink3" style={styles.empty}>
          No demo requests yet.
        </Text>
      ) : (
        <Card padded={false}>
          {items.map((d, i) => {
            const status = demoStatusBadge(d.status);
            return (
              <View key={d.id}>
                {i > 0 ? <Divider inset={space[4]} /> : null}
                <ListRow
                  title={d.business.name}
                  meta={rowMeta(d, now)}
                  icon={MonitorSmartphone}
                  iconTone={status.tone}
                  trailing={<Badge label={status.label} tone={status.tone} />}
                  background="surface"
                  onPress={() => open(d)}
                  accessibilityHint="Opens the demo request"
                />
              </View>
            );
          })}
        </Card>
      );
  } else if (query.isPending && query.fetchStatus === 'paused') {
    content = <ErrorState compact message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else if (query.isError) {
    content = <ErrorState compact error={query.error} onRetry={() => query.refetch()} />;
  } else {
    content = showSkeleton ? <SkeletonList rows={1} trailing={false} /> : null;
  }

  return (
    <Section title="Demo" style={style} spacing={0}>
      <View style={styles.body}>
        {content}
        {more ? (
          <Text variant="caption" color="ink4">
            Showing the newest {items.length}. Find the rest under Customers, Demos.
          </Text>
        ) : null}
        {canRequest ? (
          <Button
            label="Request a demo"
            icon={MonitorSmartphone}
            variant="secondary"
            size="sm"
            onPress={request}
            accessibilityHint="Opens the demo request form for this business"
            style={styles.button}
          />
        ) : null}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3] },
  empty: { paddingVertical: space[1] },
  button: { alignSelf: 'flex-start' },
});
