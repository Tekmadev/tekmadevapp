import { router } from 'expo-router';
import { Pause } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import type { StaffActivityRow, TeamMeta } from '@/api/schemas/team';
import { roleCopy } from '@/auth/permissions';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { PressableScale } from '@/components/PressableScale';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { space, type Tone } from '@/design/tokens';
import { formatShortDate } from '@/lib/dates';
import { countLabel, formatCount } from '@/lib/format';
import { creditRoleLabel, sharePercent } from '@/modules/clients/sections/credits/logic';

import { clientsWonText, followUpText, followUpTone, STAFF_COPY, touchBreakdown } from './staff';

export type ActivityCardProps = {
  row: StaffActivityRow;
  /** For the credit role labels. */
  meta: Pick<TeamMeta, 'creditRoles'> | undefined;
  now: Date;
  /** The name, role and badges at the top (the team board); My activity's title already says whose it is. */
  identity: boolean;
  /** This row is the signed-in person ("You" badge on the team board). */
  mine?: boolean;
  /** How many credit rows to list before "and N more" (default: all). */
  creditLimit?: number;
};

type Stat = { label: string; value: string; spoken: string };

/**
 * One person on the activity board: clients won (their credit shares, so
 * 1.5 is one whole client and a half), calls booked, touches and leads found
 * in the range; then outreach by kind, follow-ups due (overdue in signal,
 * today in gold; not ranged), clients helped, and their credit rows on
 * clients won in the range. A credit row opens the client.
 */
export function ActivityCard({ row, meta, now, identity, mine = false, creditLimit }: ActivityCardProps) {
  const name = row.name?.trim() || row.email;
  const role = roleCopy(row.role);
  const stats: Stat[] = [
    { label: 'Clients won', value: clientsWonText(row.clientsWon), spoken: `${clientsWonText(row.clientsWon)} clients won` },
    { label: 'Calls booked', value: formatCount(row.callsBooked), spoken: countLabel(row.callsBooked, 'call booked', 'calls booked') },
    { label: 'Touches', value: formatCount(row.touches.total), spoken: countLabel(row.touches.total, 'touch', 'touches') },
    { label: 'Leads found', value: formatCount(row.leadsFound), spoken: countLabel(row.leadsFound, 'lead found', 'leads found') },
  ];
  const followTone = followUpTone(row.followUps);
  const credits = creditLimit === undefined ? row.credits : row.credits.slice(0, creditLimit);
  const more = row.credits.length - credits.length;

  const summary = [
    identity ? name : null,
    identity ? role.label : null,
    identity && row.paused ? STAFF_COPY.paused : null,
    identity && mine ? 'you' : null,
    ...stats.map((s) => s.spoken),
    `outreach: ${touchBreakdown(row.touches)}`,
    `follow-ups: ${followUpText(row.followUps)}`,
    countLabel(row.clientsHelped, 'client helped', 'clients helped'),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card padded={false}>
      <View accessible accessibilityLabel={summary} style={styles.top}>
        {identity ? (
          <View style={styles.identity}>
            <Avatar name={name} size="md" />
            <View style={styles.identityText}>
              <Text variant="title" numberOfLines={1}>
                {name}
              </Text>
              {row.name?.trim() ? (
                <Text variant="small" color="ink3" numberOfLines={1}>
                  {row.email}
                </Text>
              ) : null}
              <View style={styles.badges}>
                <Badge label={role.label} tone={role.tone} />
                {row.paused ? <Badge label={STAFF_COPY.paused} tone="warn" icon={Pause} /> : null}
                {mine ? <Badge label="You" tone="neutral" /> : null}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.grid}>
          {stats.map((s, i) => (
            <View key={s.label} style={styles.cell}>
              <Text variant="number" tabular tone={i === 0 ? 'gold' : undefined} numberOfLines={1} adjustsFontSizeToFit>
                {s.value}
              </Text>
              <Text variant="small" color="ink3" numberOfLines={2}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.lines}>
          <Line label="Outreach" value={touchBreakdown(row.touches)} />
          <Line label="Follow-ups" value={followUpText(row.followUps)} tone={followTone === 'muted' ? undefined : followTone} />
          <Line label="Clients helped" value={formatCount(row.clientsHelped)} />
        </View>
      </View>

      <Divider />
      <View style={styles.credits}>
        <Text variant="eyebrow" style={styles.creditsTitle}>
          Credit
        </Text>
        {credits.length === 0 ? (
          <Text variant="small" color="ink3" style={styles.creditsEmpty}>
            {STAFF_COPY.creditsEmpty}
          </Text>
        ) : (
          credits.map((c, i) => {
            const line = `${creditRoleLabel(meta, c.role)} · ${sharePercent(c.share)}`;
            return (
              <Fragment key={`${c.clientId}|${c.role}`}>
                {i > 0 ? <Divider inset={space[4]} insetEnd={space[4]} /> : null}
                <PressableScale
                  onPress={() => router.push({ pathname: '/clients/[id]', params: { id: c.clientId } })}
                  pressedScale={0.99}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.businessName}, ${line}, won ${formatShortDate(c.wonAt, now)}`}
                  accessibilityHint="Opens the client"
                >
                  <View style={styles.credit}>
                    <View style={styles.creditText}>
                      <Text variant="body" numberOfLines={1}>
                        {c.businessName}
                      </Text>
                      <Text variant="small" color="ink3">
                        {`Won ${formatShortDate(c.wonAt, now)}`}
                      </Text>
                    </View>
                    <Text variant="label" tabular>
                      {line}
                    </Text>
                  </View>
                </PressableScale>
              </Fragment>
            );
          })
        )}
        {more > 0 ? (
          <Text variant="small" color="ink3" style={styles.creditsEmpty}>
            {`and ${countLabel(more, 'more client', 'more clients')}`}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <View style={styles.line}>
      <Text variant="small" color="ink3" style={styles.lineLabel}>
        {label}
      </Text>
      <Text variant="small" tone={tone} weight={tone ? '600' : undefined} align="right" style={styles.lineValue}>
        {value}
      </Text>
    </View>
  );
}

/** The card's shape while the board loads (same height, so nothing jumps). */
export function ActivityCardSkeleton({ identity }: { identity: boolean }) {
  return (
    <Card>
      <SkeletonGroup style={styles.skeleton}>
        {identity ? (
          <View style={styles.identity}>
            <Skeleton shape="circle" size={40} />
            <View style={styles.identityText}>
              <Skeleton width="55%" />
              <Skeleton width="35%" />
            </View>
          </View>
        ) : null}
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.cell}>
              <Skeleton shape="block" width="50%" height={28} />
              <Skeleton width="70%" />
            </View>
          ))}
        </View>
        <Skeleton width="80%" />
        <Skeleton width="60%" />
      </SkeletonGroup>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { padding: space[4], gap: space[4] },
  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  identityText: { flex: 1, gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[1] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space[3] },
  cell: { width: '50%', gap: 2, paddingRight: space[2] },
  lines: { gap: space[2] },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  lineLabel: { minWidth: 96 },
  lineValue: { flex: 1 },
  credits: { paddingVertical: space[3] },
  creditsTitle: { paddingHorizontal: space[4], marginBottom: space[1] },
  creditsEmpty: { paddingHorizontal: space[4], paddingTop: space[1] },
  credit: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], minHeight: 48 },
  creditText: { flex: 1, gap: 2 },
  skeleton: { gap: space[4] },
});
