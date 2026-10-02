import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { MESSAGES } from '@/api/errors';
import type { Lead, LeadPage, LeadsMeta } from '@/api/schemas/leads';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { ErrorState } from '@/components/ErrorState';
import { Section } from '@/components/Section';
import { layout, space } from '@/design/tokens';

import { ROW_DIVIDER_INSET } from './LeadListSkeleton';
import { LeadRow } from './LeadRow';

export type LeadFormsSectionProps = {
  /** The first page of lead forms under the list's other filters (undefined while it has not loaded). */
  page: LeadPage | undefined;
  /** The read failed (or is waiting for a connection) with nothing to show. */
  failed: boolean;
  error: unknown;
  offline: boolean;
  onRetry: () => unknown;
  meta: LeadsMeta | undefined;
  now: Date;
  onOpen: (lead: Lead) => void;
  /** No enter animation (reduced motion). */
  still: boolean;
  /** Filters the list to lead forms. */
  onViewAll: () => void;
};

/**
 * "Lead forms" (brief 8.6): the newest submissions of the website's lead form
 * (source grow), above the full list while the filters include them, with
 * "View all" when there are more. Nothing to show hides the section; a failed
 * read says so with Retry rather than pretending there are none.
 */
export function LeadFormsSection({ page, failed, error, offline, onRetry, meta, now, onOpen, still, onViewAll }: LeadFormsSectionProps) {
  if (failed) {
    return (
      <View style={styles.wrap}>
        <Section title="Lead forms" spacing={layout.sectionGap}>
          <ErrorState compact message={offline ? MESSAGES.network : undefined} error={error} onRetry={offline ? undefined : onRetry} />
        </Section>
        <Section title="All leads" spacing={0} />
      </View>
    );
  }
  const rows = page?.items ?? [];
  if (rows.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Section
        title="Lead forms"
        action={page?.nextCursor ? { onPress: onViewAll, accessibilityHint: 'Shows only lead forms' } : undefined}
        spacing={layout.sectionGap}
      >
        <Card padded={false}>
          {rows.map((lead, i) => (
            <Fragment key={lead.id}>
              {i > 0 ? <Divider inset={ROW_DIVIDER_INSET} /> : null}
              <LeadRow lead={lead} meta={meta} now={now} onPress={onOpen} index={i} still={still} background="surface" />
            </Fragment>
          ))}
        </Card>
      </Section>
      <Section title="All leads" spacing={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter, marginTop: space[5] },
});
