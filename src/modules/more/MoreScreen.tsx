import { router, useFocusEffect } from 'expo-router';
import { ChartLine, ChevronRight, LogOut, SlidersHorizontal, Smartphone, Trophy, Wallet, type LucideIcon } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { sessionKeys } from '@/api/endpoints/session';
import { ApiError, errorMessage } from '@/api/errors';
import { queryClient } from '@/api/query';
import type { Me } from '@/api/schemas/session';
import { roleCopy, useCan } from '@/auth/permissions';
import { session, useMe } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Divider } from '@/components/Divider';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { enterPull } from '@/design/motion';
import { space } from '@/design/tokens';
import { connectivity } from '@/lib/connectivity';
import { env } from '@/lib/env';
import { plural } from '@/lib/format';
import { notice } from '@/lib/notice';
import { drafts } from '@/lib/storage';
import { clearAppShortcuts } from '@/modules/quickActions/shortcuts';
import { moreMenu, useVisibility, type MoreMenuSection } from '@/modules/registry';
import { STAFF_COPY } from '@/modules/team/staff';
import { searchSheet } from '@/modules/search/searchStore';
import { TabHeaderActions } from '@/modules/shell/TabHeaderActions';
import type { MoreSection } from '@/modules/types';

const SECTION_ICONS: Record<MoreSection, LucideIcon> = {
  insights: ChartLine,
  sales: Wallet,
  settings: SlidersHorizontal,
  app: Smartphone,
};

/** Rows inside a card: the divider starts where the row text does. */
const ROW_TEXT_INSET = 72;
/** /me is refreshed on focus at most this often (role, flags and name rarely change). */
const ME_FRESH_MS = 60_000;

export const SIGN_OUT_COPY = {
  title: 'Sign out?',
  plain: 'Data the app keeps on this phone is cleared. Sign in again any time with your email and password.',
  confirm: 'Hold to sign out',
  pending: 'Signing out',
} as const;

/** The sign-out message, warning about unsaved drafts when there are any. */
export function signOutMessage(draftCount: number): string {
  if (draftCount <= 0) return SIGN_OUT_COPY.plain;
  const which = draftCount === 1 ? 'an unsaved draft' : `${draftCount} unsaved drafts`;
  return `You have ${which} on this phone. Signing out deletes ${plural(draftCount, 'it', 'them')}, and clears everything else the app keeps here.`;
}

function refreshMeIfStale() {
  if (!connectivity.isOnline()) return;
  const updatedAt = queryClient.getQueryState(sessionKeys.me)?.dataUpdatedAt ?? 0;
  if (Date.now() - updatedAt < ME_FRESH_MS) return;
  session.refreshMe().catch(() => undefined);
}

/** Pull to refresh: who am I, my role, capabilities and the feature flags that shape this menu. */
async function refreshMe() {
  try {
    await session.refreshMe();
  } catch (e) {
    // Session, owner-only and version problems are already handled by the client.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 426 || e.kind === 'aborted')) return;
    notice.err(errorMessage(e));
  }
}

/** Sign out on purpose: drafts, recent searches and launcher shortcuts go too (brief 8.18). */
async function signOut() {
  drafts.clearAll();
  searchSheet.reset();
  await clearAppShortcuts();
  await session.signOut();
}

/**
 * The More tab: the full menu (owner decision: no side drawer), generated from
 * the module registry and filtered by capability and feature flags. A profile card
 * on top, then Insights, Sales, Settings and App, then Sign out and the version.
 */
export function MoreScreen() {
  const me = useMe();
  const visibility = useVisibility();
  const sections = moreMenu(visibility);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  useFocusEffect(refreshMeIfStale);

  const openSignOut = () => {
    setDraftCount(drafts.list().length);
    setSignOutOpen(true);
  };

  // Enter order: profile, each section, sign out (staggered, first 8 only).
  const first = me ? 1 : 0;
  return (
    <>
      <Screen title="More" headerRight={<TabHeaderActions />} onRefresh={refreshMe} queryKey={sessionKeys.me}>
        {me ? (
          <Animated.View entering={enterPull(0)} style={styles.block}>
            <ProfileCard me={me} />
            <ActivityRow />
          </Animated.View>
        ) : null}

        {sections.map((section, index) => (
          <Animated.View key={section.id} entering={enterPull(first + index)} style={styles.block}>
            <MenuSection section={section} />
          </Animated.View>
        ))}

        <Animated.View entering={enterPull(first + sections.length)} style={styles.block}>
          <Card padded={false}>
            <ListRow
              title="Sign out"
              icon={LogOut}
              iconTone="signal"
              chevron={false}
              onPress={openSignOut}
              accessibilityHint="Asks before signing you out"
            />
          </Card>
        </Animated.View>

        <Text variant="caption" color="ink4" align="center" tabular style={styles.version}>
          Version {env.appVersion} · Build {env.buildNumber}
        </Text>
      </Screen>

      <ConfirmSheet
        visible={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title={SIGN_OUT_COPY.title}
        message={signOutMessage(draftCount)}
        confirmLabel={SIGN_OUT_COPY.confirm}
        pendingLabel={SIGN_OUT_COPY.pending}
        tone={draftCount > 0 ? 'signal' : 'ink'}
        requiresNetwork={false}
        onConfirm={signOut}
      />
    </>
  );
}

function ProfileCard({ me }: { me: Me }) {
  const name = me.user.name?.trim() || null;
  // Owner gold, Manager neutral, Staff muted.
  const { label: roleLabel, tone: roleTone } = roleCopy(me.role);
  const display = name ?? me.user.email;

  return (
    <Card
      onPress={() => router.push('/profile')}
      accessibilityLabel={[display, name ? me.user.email : null, roleLabel].filter(Boolean).join(', ')}
      accessibilityHint="Opens your profile"
      testID="more-profile"
    >
      {/* The card reads as one item ("name, email, role"), not three. */}
      <View style={styles.profile} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Avatar name={display} size="lg" />
        <View style={styles.profileText}>
          <Text variant="title" numberOfLines={1}>
            {display}
          </Text>
          {name ? (
            <Text variant="small" color="ink3" numberOfLines={1}>
              {me.user.email}
            </Text>
          ) : null}
          <Badge label={roleLabel} tone={roleTone} style={styles.role} />
        </View>
        <Icon icon={ChevronRight} size={18} color="ink4" />
      </View>
    </Card>
  );
}

/**
 * Under the profile card: "Team activity" for people who see everyone's
 * scoreboard (`team.activity`), else "My activity" (`activity.own`, staff).
 */
function ActivityRow() {
  const seesTeam = useCan('team.activity');
  const seesOwn = useCan('activity.own');
  if (!seesTeam && !seesOwn) return null;
  return (
    <Card padded={false} style={styles.activity}>
      <ListRow
        title={seesTeam ? STAFF_COPY.teamActivity : STAFF_COPY.myActivity}
        subtitle={seesTeam ? STAFF_COPY.teamActivityHint : STAFF_COPY.myActivityHint}
        icon={Trophy}
        iconTone="gold"
        onPress={() => router.push(seesTeam ? '/team-activity' : '/my-activity')}
      />
    </Card>
  );
}

function MenuSection({ section }: { section: MoreMenuSection }) {
  return (
    <View>
      <View style={styles.sectionHeader} accessible accessibilityRole="header" accessibilityLabel={section.title}>
        <Icon icon={SECTION_ICONS[section.id]} size={14} color="ink3" />
        <Text variant="eyebrow">{section.title}</Text>
      </View>
      <Card padded={false}>
        {section.modules.map((m, index) => (
          <Fragment key={m.id}>
            {index > 0 ? <Divider inset={ROW_TEXT_INSET} /> : null}
            <ListRow title={m.title} subtitle={m.summary} icon={m.icon} onPress={() => router.push(m.href)} />
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: space[6] },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  profileText: { flex: 1, gap: 2 },
  role: { marginTop: space[1] },
  activity: { marginTop: space[3] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginBottom: space[2],
    paddingHorizontal: space[1],
  },
  version: { marginTop: space[2], marginBottom: space[4] },
});
