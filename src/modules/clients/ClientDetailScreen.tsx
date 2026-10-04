import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clientKeys, clientQuery } from '@/api/endpoints/clients';
import { ApiError, MESSAGES } from '@/api/errors';
import type { ClientList } from '@/api/schemas/clients';
import { useCan } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { ErrorState } from '@/components/ErrorState';
import { goBack } from '@/components/Header';
import { Screen, type ScreenHandle } from '@/components/Screen';
import { useShowAfter } from '@/components/Skeleton';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import type { ClientSection } from '@/lib/deeplinks';

import { ClientHeader } from './detail/ClientHeader';
import { ClientMenu } from './detail/ClientMenu';
import { ClientStatCards } from './detail/ClientStatCards';
import { DetailSkeleton } from './detail/DetailSkeleton';
import { anchorDelta, initialSection, jumpOffset, oneParam, UNMEASURED, visibleSections } from './detail/logic';
import { useMeta } from './detail/meta';
import { SectionTabs } from './detail/SectionTabs';
import { AccessSection } from './sections/AccessSection';
import { AccountSection } from './sections/AccountSection';
import { ActivitySection } from './sections/ActivitySection';
import { AgreementsSection } from './sections/AgreementsSection';
import { ApprovalsSection } from './sections/ApprovalsSection';
import { CallsSection } from './sections/CallsSection';
import { CrmSection } from './sections/CrmSection';
import { FilesSection } from './sections/FilesSection';
import { IntakeSection } from './sections/IntakeSection';
import { OnboardingSection } from './sections/OnboardingSection';
import { TeamSection } from './sections/TeamSection';
import type { SectionProps } from './sections/types';

const SECTION_COMPONENTS: Record<ClientSection, ComponentType<SectionProps>> = {
  onboarding: OnboardingSection,
  intake: IntakeSection,
  access: AccessSection,
  files: FilesSection,
  approvals: ApprovalsSection,
  agreements: AgreementsSection,
  calls: CallsSection,
  crm: CrmSection,
  team: TeamSection,
  account: AccountSection,
  activity: ActivitySection,
};

/** A generous upper bound on Android's smooth scroll, which has no completion callback. */
const JUMP_GLIDE_MS = 900;
/** The tab row's height before it measures itself (a 48dp tab plus its 1dp hairline). */
const TABS_GUESS = layout.minTouch + 1;
/** Breathing room above each section, so a jump never lands its title against the tabs. */
const SECTION_TOP = space[4];
/** Layout key of the block above the tabs (header and stat cards). */
const HEAD = 'head';

type Block = { top: number; height: number };

/** The business name from a Clients list already in the cache, so the title shows before the bundle loads. */
function cachedBusinessName(queryClient: QueryClient, id: string): string | undefined {
  const lists = queryClient.getQueriesData<InfiniteData<ClientList>>({ queryKey: clientKeys.lists() });
  for (const [, data] of lists) {
    for (const page of data?.pages ?? []) {
      const row = page.items.find((r) => r.id === id);
      if (row) return row.businessName;
    }
  }
  return undefined;
}

/**
 * Client detail (brief 8.5): GET /clients/:id as one bundle. The business name
 * is the large title; under it the contact line, badges, Go live and Open
 * portal, then the four stat cards. Section tabs stick under the header:
 * tapping one glides to its section and scrolling moves the active tab.
 * `section` (from /admin/clients/<id>#<section>) opens scrolled to that
 * section once it has laid out; `action` is handed to the sections once
 * (Calls opens "Log a booked call" for `log-call`).
 *
 * What shows follows the person's capabilities: the CRM tab and section need
 * `clients.crm`, and each section hides the actions this person cannot take.
 */
export function ClientDetailScreen() {
  return (
    <RequireCapability cap="clients.view">
      <ClientDetail />
    </RequireCapability>
  );
}

function ClientDetail() {
  const params = useLocalSearchParams<{ id: string; section?: string; action?: string }>();
  const id = oneParam(params.id) ?? '';
  const sectionParam = oneParam(params.section);
  const actionParam = oneParam(params.action);

  const queryClient = useQueryClient();
  const canCrm = useCan('clients.crm');
  const reduceMotion = useReduceMotion();
  const showSkeleton = useShowAfter();
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const query = useQuery({ ...clientQuery(id), enabled: id !== '' });
  const meta = useMeta();
  const [cachedTitle] = useState(() => cachedBusinessName(queryClient, id));

  const sections = visibleSections(canCrm);

  // The route's action, handed to the sections until one of them has handled it.
  const [action, setAction] = useState(actionParam);
  const [seenAction, setSeenAction] = useState(actionParam);
  if (actionParam !== seenAction) {
    setSeenAction(actionParam);
    setAction(actionParam);
  }

  const [tabsHeightState, setTabsHeightState] = useState(TABS_GUESS);

  const screenRef = useRef<ScreenHandle>(null);
  const scrollY = useSharedValue(0);
  const offsets = useSharedValue<number[]>(sections.map(() => UNMEASURED));
  const tabsHeight = useSharedValue(TABS_GUESS);
  const pinned = useSharedValue(-1);
  const gliding = useSharedValue(false);
  const anchorY = useSharedValue(0);
  const blocks = useRef(new Map<string, Block>());
  const pendingJump = useRef<ClientSection | null>(null);
  const glideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<{ delta: number; frame: number | null }>({ delta: 0, frame: null });
  const trashed = useRef(false);

  /** Scroll so the section's top sits right under the sticky tabs; its tab stays active while it lands. */
  const jumpTo = (section: ClientSection, animated: boolean) => {
    const block = blocks.current.get(section);
    const index = sections.indexOf(section);
    if (!block || index < 0) return;
    const y = jumpOffset(block.top, tabsHeight.get());
    pinned.set(index);
    anchorY.set(y);
    if (glideTimer.current) clearTimeout(glideTimer.current);
    gliding.set(animated);
    if (animated) glideTimer.current = setTimeout(() => gliding.set(false), JUMP_GLIDE_MS);
    screenRef.current?.scrollTo(y, animated);
  };

  /** The deep-linked section, once it and everything above it have laid out. */
  const tryPendingJump = () => {
    const target = pendingJump.current;
    if (!target) return;
    const index = sections.indexOf(target);
    if (index < 0) {
      pendingJump.current = null;
      return;
    }
    const ready = blocks.current.has(HEAD) && sections.slice(0, index + 1).every((s) => blocks.current.has(s));
    if (!ready) return;
    pendingJump.current = null;
    requestAnimationFrame(() => jumpTo(target, false));
  };

  /**
   * A block reported its layout. Section tops feed the scroll spy. When a block
   * above the reader changes height (a section's content changed), the scroll
   * moves by the same amount next frame so nothing on screen jumps.
   */
  const onMeasure = (key: string, e: LayoutChangeEvent) => {
    const { y: top, height } = e.nativeEvent.layout;
    const previous = blocks.current.get(key);
    blocks.current.set(key, { top, height });
    offsets.set(sections.map((s) => blocks.current.get(s)?.top ?? UNMEASURED));
    tryPendingJump();
    if (!previous || gliding.get() || pendingJump.current) return;
    const delta = anchorDelta(previous, height, scrollY.get(), tabsHeight.get());
    if (delta === 0) return;
    anchor.current.delta += delta;
    if (anchor.current.frame !== null) return;
    anchor.current.frame = requestAnimationFrame(() => {
      const total = anchor.current.delta;
      anchor.current = { delta: 0, frame: null };
      screenRef.current?.scrollTo(Math.max(0, scrollY.get() + total), false);
      if (pinned.get() >= 0) anchorY.set(anchorY.get() + total);
    });
  };

  // Open at the route's section (also when a new link arrives while this screen is open).
  const requestJump = useEffectEvent((section: string | undefined, routeAction: string | undefined) => {
    const target = initialSection(section, routeAction, visibleSections(canCrm));
    if (!target) return;
    pendingJump.current = target;
    tryPendingJump();
  });
  useEffect(() => {
    requestJump(sectionParam, actionParam);
  }, [sectionParam, actionParam]);

  // Back on this screen (from a pushed screen or another tab): refresh when the data is stale.
  // App resume is TanStack's focus manager.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void queryClient.refetchQueries({ queryKey: clientKeys.detail(id), type: 'active', stale: true });
    }, [queryClient, id]),
  );

  useEffect(() => {
    const timers = glideTimer;
    const frames = anchor;
    const gone = trashed;
    return () => {
      if (timers.current) clearTimeout(timers.current);
      if (frames.current.frame !== null) cancelAnimationFrame(frames.current.frame);
      // A trashed client's bundle leaves the cache only now, so the screen never refetches it while it slides away.
      if (gone.current) queryClient.removeQueries({ queryKey: clientKeys.detail(id), exact: true });
    };
  }, [queryClient, id]);

  // A 404 means the client is gone (trashed elsewhere): say so instead of showing what was cached.
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const bundle = notFound ? undefined : query.data;
  const title = bundle?.client.businessName ?? cachedTitle;

  let body: ReactNode;
  if (!id) {
    body = <ErrorState message={MESSAGES.notFound} />;
  } else if (bundle) {
    // Bottom padding of the screen (it is not in the tabs) and the visible height under the header.
    const bottomPad = insets.bottom + space[6];
    const viewport = windowHeight - insets.top - layout.headerHeight;
    // The last section is at least a screen tall, so it too can scroll up under the tabs.
    const lastMinHeight = Math.max(0, viewport - tabsHeightState - bottomPad);
    const lastSection = sections[sections.length - 1];

    body = [
      <View key={HEAD} onLayout={(e) => onMeasure(HEAD, e)}>
        <ClientHeader bundle={bundle} meta={meta.data} />
        <ClientStatCards bundle={bundle} meta={meta.data} onOpenSection={(s) => jumpTo(s, !reduceMotion)} />
      </View>,
      <SectionTabs
        key="tabs"
        sections={sections}
        scrollY={scrollY}
        offsets={offsets}
        tabsHeight={tabsHeight}
        pinned={pinned}
        gliding={gliding}
        anchorY={anchorY}
        probe={Math.round(viewport * 0.25)}
        onJump={(s) => jumpTo(s, !reduceMotion)}
        onHeight={(h) => {
          tabsHeight.set(h);
          setTabsHeightState(h);
        }}
      />,
      ...sections.map((section) => {
        const Body = SECTION_COMPONENTS[section];
        return (
          <View
            key={section}
            onLayout={(e) => onMeasure(section, e)}
            style={[styles.section, section === lastSection ? { minHeight: lastMinHeight } : null]}
          >
            <Body clientId={id} bundle={bundle} action={action} onActionHandled={() => setAction(undefined)} />
          </View>
        );
      }),
    ];
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: say so instead of a skeleton that never ends. It loads by itself once back online.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = showSkeleton ? <DetailSkeleton withTitle={Boolean(title)} /> : null;
  }

  return (
    <Screen
      ref={screenRef}
      title={title}
      back
      scrollY={scrollY}
      stickyHeaderIndices={bundle ? [1] : undefined}
      onRefresh={id ? () => query.refetch() : undefined}
      refetching={query.isFetching && !query.isPending}
      queryKey={clientKeys.detail(id)}
      headerRight={
        bundle ? (
          <ClientMenu
            clientId={id}
            businessName={bundle.client.businessName}
            onTrashed={() => {
              trashed.current = true;
              goBack();
            }}
          />
        ) : undefined
      }
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: SECTION_TOP },
});
