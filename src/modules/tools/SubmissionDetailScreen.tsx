import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { toolKeys, toolSubmissionQuery } from '@/api/endpoints/tools';
import { ApiError, MESSAGES } from '@/api/errors';
import { ErrorState } from '@/components/ErrorState';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { useShowAfter } from '@/components/Skeleton';
import { useIsOnline } from '@/lib/connectivity';

import { AnswersCard } from './detail/AnswersCard';
import { BreakdownCard } from './detail/BreakdownCard';
import { cachedSubmissionRow } from './detail/cache';
import { DetailsCard } from './detail/DetailsCard';
import { SubmissionContact } from './detail/SubmissionContact';
import { SubmissionDetailSkeleton } from './detail/SubmissionDetailSkeleton';
import { SubmissionSummary } from './detail/SubmissionSummary';
import { displayName, firstParam } from './logic';

/**
 * A free tool submission (brief 8.7, GET /tools/submissions/:id), opened from
 * the Free tools list or /admin/tools/<id>. The person's name is the large
 * title with the tool as its eyebrow; under it their business and email with
 * Email and Copy email, the two headline numbers, then the computed
 * Breakdown, their Answers and the Details (newsletter, delivery, the lead).
 *
 * The row from a cached list fills the top straight away; only the sections
 * wait for the detail. A 404 means the submission is gone: it says so even
 * when something was cached.
 */
export function SubmissionDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = firstParam(params.id);
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const showSkeleton = useShowAfter();
  const query = useQuery({ ...toolSubmissionQuery(id), enabled: id !== '' });
  const [cachedRow] = useState(() => cachedSubmissionRow(queryClient, id));

  // Back on this screen (from the lead, or another app): refresh when stale. App resume is TanStack's focus manager.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      if (id) void queryClient.refetchQueries({ queryKey: toolKeys.submission(id), type: 'active', stale: true });
    }, [queryClient, id]),
  );

  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const detail = notFound ? undefined : query.data;
  const row = notFound ? undefined : (detail ?? cachedRow);
  const paused = query.isPending && query.fetchStatus === 'paused';
  const retry = () => query.refetch();

  let body: ReactNode;
  if (!id) {
    body = <ErrorState message={MESSAGES.notFound} />;
  } else if (notFound) {
    body = <ErrorState error={query.error} />;
  } else if (row) {
    let sections: ReactNode;
    if (detail) {
      sections = (
        <View>
          <Section title="Breakdown">
            <BreakdownCard lines={detail.result} />
          </Section>
          <Section title="Answers">
            <AnswersCard answers={detail.answers} />
          </Section>
          <Section title="Details">
            <DetailsCard detail={detail} />
          </Section>
        </View>
      );
    } else if (query.isError) {
      sections = <ErrorState compact error={query.error} onRetry={retry} />;
    } else if (paused) {
      // Offline with only the list cached: the top is real, the rest waits for the connection.
      sections = <ErrorState compact message={MESSAGES.network} onRetry={online ? retry : undefined} />;
    } else {
      sections = showSkeleton ? <SubmissionDetailSkeleton part="sections" /> : null;
    }
    body = (
      <View>
        <SubmissionContact row={row} />
        <SubmissionSummary row={row} />
        {sections}
      </View>
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={retry} />;
  } else if (paused) {
    // Offline with nothing cached: say so instead of a skeleton that never ends. It loads by itself once back online.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? retry : undefined} />;
  } else {
    body = showSkeleton ? <SubmissionDetailSkeleton part="all" withTitle /> : null;
  }

  return (
    <Screen
      title={row ? displayName(row) : undefined}
      eyebrow={row?.toolName}
      back
      onRefresh={id && !notFound ? retry : undefined}
      refetching={query.isFetching && !query.isPending}
      queryKey={toolKeys.submission(id)}
    >
      {body}
    </Screen>
  );
}
