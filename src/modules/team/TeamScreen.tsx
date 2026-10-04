import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Lock, UserMinus, UserPlus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { teamKeys, teamQuery } from '@/api/endpoints/team';
import { MESSAGES } from '@/api/errors';
import type { TeamMember } from '@/api/schemas/team';
import { roleCopy, useCan } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { useMe } from '@/auth/session';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Fab } from '@/components/Fab';
import { ListRow } from '@/components/ListRow';
import { ScreenList } from '@/components/ScreenList';
import { SkeletonList } from '@/components/Skeleton';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { formatShortDate } from '@/lib/dates';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { useMinuteClock } from '@/modules/overview/hooks';

import { AddTeamMemberSheet } from './AddTeamMemberSheet';
import { useRemoveMember } from './hooks';
import { addableRoles, canRemove, isSelf, lastSignInText, memberMeta, memberName, removeMessage, TEAM_COPY } from './logic';
import { TeamMemberSheet } from './TeamMemberSheet';

/** Rows line up their dividers with the text after the 40dp avatar. */
const ROW_TEXT_INSET = 72;
/** Room under the last row so the floating add button never covers it. */
const FAB_CLEARANCE = 56 + space[4] * 2;
/** Without the add button: the usual space under a list. */
const LIST_END = space[6];

const memberKey = (m: TeamMember) => m.email;
const Separator = () => <Divider inset={ROW_TEXT_INSET} />;

/**
 * Team (brief 8.16; `team.view`, owners and managers): everyone who can sign
 * in to the admin, owners first. Each row shows name, email, role badge (Owner
 * gold, Manager neutral, Staff muted), last sign in or "never", and when they
 * were added. Owners set by the server environment carry a lock and are never
 * removed. With `team.write` the gold button adds a team member (Owner is a
 * choice only with `team.owners`). With `team.remove` (owners only) a row's
 * sheet and a left swipe offer Remove; a manager sees no Remove at all.
 */
export function TeamScreen() {
  return (
    <RequireCapability cap="team.view">
      <TeamBody />
    </RequireCapability>
  );
}

function TeamBody() {
  const me = useMe();
  const myEmail = me?.user.email ?? null;
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();
  const mayAdd = useCan('team.write');
  const mayRemove = useCan('team.remove');
  const mayMakeOwners = useCan('team.owners');
  const query = useQuery(teamQuery());
  useRefreshOnFocus([teamKeys.all]);
  const remove = useRemoveMember();

  const [adding, setAdding] = useState(false);
  // Kept as the row that was tapped, so a sheet stays put if a refetch drops the row.
  const [opened, setOpened] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const team = query.data;
  const latest = (m: TeamMember | null) => (m ? (team?.find((x) => x.email === m.email) ?? m) : null);
  const openMember = latest(opened);
  // Remove is only offered with `team.remove`; losing it (a role change) also closes the hold sheet.
  const removeTarget = mayRemove ? latest(removing) : null;

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    await query.refetch();
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    await remove(removeTarget);
    setOpened(null);
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<TeamMember>) => (
    <MemberItem
      member={item}
      index={index}
      myEmail={myEmail}
      now={now}
      still={reduceMotion}
      swipe={online}
      mayRemove={mayRemove}
      onOpen={setOpened}
      onRemove={setRemoving}
    />
  );

  const header =
    query.isRefetchError && team !== undefined && online ? (
      <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} />
    ) : null;

  let empty: ReactNode;
  if (team) {
    empty = team.length === 0 ? <EmptyState message={TEAM_COPY.empty} style={styles.gutter} /> : null;
  } else if (query.isError) {
    empty = <ErrorState error={query.error} onRetry={() => query.refetch()} style={styles.gutter} />;
  } else if (query.isPending && query.fetchStatus === 'paused') {
    // Offline with nothing cached. The fetch resumes by itself once the connection is back.
    empty = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} style={styles.gutter} />;
  } else {
    // Rows bring their own gutter, like the ListRows they stand in for.
    empty = <SkeletonList rows={3} />;
  }

  return (
    <>
      <ScreenList<TeamMember>
        title={TEAM_COPY.title}
        back
        data={team ?? []}
        renderItem={renderItem}
        keyExtractor={memberKey}
        ItemSeparatorComponent={Separator}
        extraData={[myEmail, now, reduceMotion, online, mayRemove]}
        ListHeaderComponent={header}
        ListEmptyComponent={empty ? <View>{empty}</View> : null}
        ListFooterComponent={<View style={mayAdd ? styles.footerFab : styles.footer} />}
        onRefresh={onRefresh}
        refetching={query.isFetching && team !== undefined}
        // The banner says "showing what was loaded at ..."; with nothing loaded the ErrorState says it instead.
        offlineBanner={team !== undefined}
        queryKey={teamKeys.list()}
      />
      {mayAdd ? (
        <Fab icon={UserPlus} onPress={() => setAdding(true)} accessibilityLabel={TEAM_COPY.add} accessibilityHint="Opens the form" />
      ) : null}

      {adding && mayAdd ? <AddTeamMemberSheet roles={addableRoles(mayMakeOwners)} onClose={() => setAdding(false)} /> : null}
      {openMember ? (
        <TeamMemberSheet
          key={openMember.email}
          member={openMember}
          myEmail={myEmail}
          mayRemove={mayRemove}
          onRemove={setRemoving}
          onClose={() => setOpened(null)}
        />
      ) : null}
      <ConfirmSheet
        visible={removeTarget !== null}
        onClose={() => setRemoving(null)}
        title={TEAM_COPY.removeTitle}
        message={removeTarget ? removeMessage(removeTarget) : ''}
        confirmLabel={TEAM_COPY.removeHold}
        pendingLabel={TEAM_COPY.removing}
        onConfirm={confirmRemove}
      />
    </>
  );
}

type MemberItemProps = {
  member: TeamMember;
  index: number;
  myEmail: string | null;
  now: Date;
  still: boolean;
  /** Swipe to remove (hidden offline: the hold sheet would only say "You are offline"). */
  swipe: boolean;
  /** The signed-in person may remove members (`team.remove`). */
  mayRemove: boolean;
  onOpen: (member: TeamMember) => void;
  onRemove: (member: TeamMember) => void;
};

function MemberItem({ member, index, myEmail, now, still, swipe, mayRemove, onOpen, onRemove }: MemberItemProps) {
  const animate = !still && index < STAGGER_MAX;
  const badge = roleCopy(member.role);
  const self = isSelf(member, myEmail);
  const subtitle = [member.name ? member.email : null, self ? 'You' : null].filter(Boolean).join(' · ');
  const meta = memberMeta(member, now);
  const removable = canRemove(member, myEmail, mayRemove);

  const spoken = [
    memberName(member),
    subtitle || null,
    badge.label,
    member.envOwner ? 'locked, set by the server, cannot be removed' : null,
    `last sign in ${lastSignInText(member.lastSignInAt, now)}`,
    `added ${formatShortDate(member.addedAt, now)}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View entering={animate ? enterPull(index) : undefined}>
      <ListRow
        itemKey={member.email}
        title={memberName(member)}
        subtitle={subtitle || undefined}
        meta={meta}
        avatar={{ name: member.name ?? member.email }}
        badge={{ label: badge.label, tone: badge.tone, icon: member.envOwner ? Lock : undefined }}
        onPress={() => onOpen(member)}
        rightAction={
          removable && swipe ? { label: 'Remove', icon: UserMinus, tone: 'signal', onAction: () => onRemove(member) } : undefined
        }
        accessibilityLabel={spoken}
        accessibilityHint="Opens details"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  refetchError: { marginBottom: space[4] },
  footer: { height: LIST_END },
  footerFab: { height: FAB_CLEARANCE },
});
