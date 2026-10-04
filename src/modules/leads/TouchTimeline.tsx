import type { InfiniteData } from '@tanstack/react-query';
import { Mail, MessageCircle, MoreHorizontal, Phone, Users, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { LeadsMeta, Touch, TouchKind, TouchPage } from '@/api/schemas/leads';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';

import { uniqueById } from './logic';
import { staffName, touchKindLabel } from './outreach';

/** One icon per kind of outreach (also on the kind chips of the log sheet). */
export const TOUCH_KIND_ICONS: Record<TouchKind, LucideIcon> = {
  call: Phone,
  email: Mail,
  dm: MessageCircle,
  meeting: Users,
  other: MoreHorizontal,
};

const DOT = 36;

/** "Call · Left a voicemail" */
const headline = (touch: Touch, meta: LeadsMeta | undefined) =>
  [touchKindLabel(meta, touch.kind), touch.outcome?.trim() || null].filter(Boolean).join(' · ');

function TouchItem({ touch, meta, now, last }: { touch: Touch; meta: LeadsMeta | undefined; now: Date; last: boolean }) {
  const { colors, tones } = useTheme();
  const title = headline(touch, meta);
  const byline = `${staffName(touch.by)} · ${formatDateTime(touch.at, now)}`;
  return (
    <View
      style={styles.item}
      accessible
      accessibilityLabel={[title, touch.note?.trim() || null, `by ${byline}`].filter(Boolean).join(', ')}
    >
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: tones.neutral.bg }]}>
          <Icon icon={TOUCH_KIND_ICONS[touch.kind]} size={17} color="ink2" />
        </View>
        {last ? null : <View style={[styles.line, { backgroundColor: colors.line }]} />}
      </View>
      <View style={[styles.texts, last ? null : styles.gap]}>
        <Text variant="bodyStrong">{title}</Text>
        {touch.note?.trim() ? (
          <Text variant="body" color="ink2" selectable>
            {touch.note}
          </Text>
        ) : null}
        <Text variant="caption" color="ink4" tabular>
          {byline}
        </Text>
      </View>
    </View>
  );
}

export type TouchTimelineProps = {
  data: InfiniteData<TouchPage> | undefined;
  meta: LeadsMeta | undefined;
  now: Date;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

/**
 * The touches on a lead, newest first, as a timeline: the kind's icon on a
 * rail, the kind and the outcome, the note as typed, then who logged it and
 * when (Toronto time). Older touches load a page at a time with "Show older".
 * The caller handles loading, failure and empty.
 */
export function TouchTimeline({ data, meta, now, hasMore, loadingMore, onLoadMore }: TouchTimelineProps) {
  const touches = uniqueById(data?.pages);
  return (
    <View accessibilityRole="list">
      {touches.map((touch, i) => (
        <TouchItem key={touch.id} touch={touch} meta={meta} now={now} last={i === touches.length - 1 && !hasMore} />
      ))}
      {hasMore ? (
        <Button
          label="Show older"
          variant="ghost"
          size="sm"
          pending={loadingMore}
          pendingLabel="Loading"
          onPress={onLoadMore}
          accessibilityHint="Loads older outreach on this lead"
          style={styles.more}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: space[3] },
  rail: { width: DOT, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 1, marginVertical: space[1] },
  texts: { flex: 1, gap: 2, paddingTop: space[2] - 1 },
  gap: { paddingBottom: space[5] },
  more: { alignSelf: 'flex-start', marginTop: space[2] },
});
