import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Fragment } from 'react';

import { leadKeys } from '@/api/endpoints/leads';
import type { Subscription } from '@/api/schemas/billing';
import type { Lead } from '@/api/schemas/leads';
import type { Meta } from '@/api/schemas/meta';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Section } from '@/components/Section';
import { relativeTime } from '@/lib/dates';

import {
  leadSourceLine,
  leadStatusBadge,
  leadTitle,
  subscriptionAmount,
  subscriptionStatusBadge,
  subscriptionTierLine,
} from './logic';

/** Brief 8.3 empty copy, exact. */
export const NO_LEADS = 'No bookings yet. They appear here once the Cal.com webhook is connected.';
export const NO_SUBSCRIPTIONS = 'No subscriptions yet. They appear here once the Stripe webhook is connected.';

/** Rows shown in each recent list (the server sends 8). */
export const RECENT_ROWS = 8;

/** Lines up with the row text after the 40dp avatar (16 gutter + 40 + 4 + 12 gap). */
const ROW_DIVIDER_INSET = 72;

type RecentLeadsProps = {
  leads: readonly Lead[];
  meta: Meta | undefined;
  now: Date;
  /** When the overview was fetched: the age the seeded lead detail gets. */
  updatedAt: number;
  /** "View all" and the rows open Leads and the lead (`leads.view`); without it the rows are read only. */
  canOpen: boolean;
};

/**
 * "Recent leads": when, name, status badge (tone from GET /meta), source and
 * campaign. A row opens the lead; the overview already holds the full lead, so
 * the detail opens from cache while it refreshes.
 */
export function RecentLeads({ leads, meta, now, updatedAt, canOpen }: RecentLeadsProps) {
  const queryClient = useQueryClient();
  const rows = leads.slice(0, RECENT_ROWS);

  const open = (lead: Lead) => {
    const key = leadKeys.detail(lead.id);
    if (queryClient.getQueryData(key) === undefined) queryClient.setQueryData(key, lead, { updatedAt });
    router.push({ pathname: '/leads/[id]', params: { id: lead.id } });
  };

  return (
    <Section
      title="Recent leads"
      action={canOpen ? { onPress: () => router.push({ pathname: '/customers', params: { segment: 'leads' } }), accessibilityHint: 'Opens Leads' } : undefined}
    >
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState message={NO_LEADS} compact />
        ) : (
          rows.map((lead, i) => {
            const status = leadStatusBadge(meta, lead.status);
            const title = leadTitle(lead);
            return (
              <Fragment key={lead.id}>
                {i > 0 ? <Divider inset={ROW_DIVIDER_INSET} /> : null}
                <ListRow
                  title={title}
                  subtitle={leadSourceLine(lead, meta)}
                  meta={relativeTime(lead.createdAt, now)}
                  avatar={{ name: title }}
                  badge={{ label: status.label, tone: status.tone }}
                  background="surface"
                  onPress={canOpen ? () => open(lead) : undefined}
                  accessibilityHint={canOpen ? 'Opens the lead' : undefined}
                />
              </Fragment>
            );
          })
        )}
      </Card>
    </Section>
  );
}

type RecentSubscriptionsProps = {
  subscriptions: readonly Subscription[];
  meta: Meta | undefined;
  now: Date;
  /** "View all" opens Subscriptions (`billing.view`); without it the section has no action. */
  canOpenAll: boolean;
};

/**
 * "Recent subscriptions": when, email, tier, status badge and amount (integer
 * cents, never rounded). Home renders it only for people with
 * `overview.revenue`; staff never get the rows from the server.
 */
export function RecentSubscriptions({ subscriptions, meta, now, canOpenAll }: RecentSubscriptionsProps) {
  const rows = subscriptions.slice(0, RECENT_ROWS);
  return (
    <Section
      title="Recent subscriptions"
      action={
        canOpenAll
          ? {
              onPress: () => router.push({ pathname: '/customers', params: { segment: 'subscriptions' } }),
              accessibilityHint: 'Opens Subscriptions',
            }
          : undefined
      }
    >
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState message={NO_SUBSCRIPTIONS} compact />
        ) : (
          rows.map((sub, i) => {
            const status = subscriptionStatusBadge(meta, sub.status);
            return (
              <Fragment key={sub.id}>
                {i > 0 ? <Divider inset={ROW_DIVIDER_INSET} /> : null}
                <ListRow
                  title={sub.email}
                  subtitle={subscriptionTierLine(sub, now)}
                  meta={relativeTime(sub.createdAt, now)}
                  avatar={{ name: sub.business ?? sub.email }}
                  value={subscriptionAmount(sub)}
                  badge={{ label: status.label, tone: status.tone }}
                  background="surface"
                />
              </Fragment>
            );
          })
        )}
      </Card>
    </Section>
  );
}
