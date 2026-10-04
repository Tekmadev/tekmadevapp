import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Activity } from '@/api/schemas/clients';
import { openInBrowser } from '@/components/automation/ApprovalBlocks';
import { isSafeHref } from '@/components/automation/markdown';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme, type Theme } from '@/design/theme';
import { space } from '@/design/tokens';
import { mapAdminUrl, parseAdminUrl, type LinkViewer } from '@/lib/deeplinks';
import { openLink as openAppLink } from '@/modules/inbox/navigation';

import type { ClientLabels } from '../labels';
import { activityContent, activityMeta, CLIENT_SEES, isLongText } from './activityText';

/**
 * Web admin paths open inside the app (only what this person may open; a tab
 * route switches tab instead of stacking a second tab bar); other https links
 * open in a Custom Tab.
 */
function openLink(url: string, viewer: LinkViewer, colors: Theme['colors']) {
  if (parseAdminUrl(url)) {
    openAppLink(mapAdminUrl(url, viewer));
    return;
  }
  openInBrowser(url, colors);
}

/** "tekmadev.com/start" from "https://www.tekmadev.com/start/". */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}

export type ActivityItemProps = {
  entry: Activity;
  labels: ClientLabels;
  /** Who follows a link: the GET /me profile (its capability list wins). */
  viewer: LinkViewer;
  /** The last row draws no rail below its dot. */
  last: boolean;
};

/**
 * One timeline entry: a dot on the rail (gold when the client sees it, with
 * the "client sees" badge), what happened, and "time · actor · event".
 */
export function ActivityItem({ entry, labels, viewer, last }: ActivityItemProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const visible = entry.visibleToClient;
  const { heading, body } = activityContent(entry);
  const meta = activityMeta(entry, labels);
  const long = isLongText(body);
  const link = entry.actionUrl && (parseAdminUrl(entry.actionUrl) || isSafeHref(entry.actionUrl)) ? entry.actionUrl : null;

  return (
    <View style={styles.entry}>
      <View style={styles.rail} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.dot, { backgroundColor: visible ? colors.gold : colors.ink5 }]} />
        {!last ? <View style={[styles.line, { backgroundColor: colors.line }]} /> : null}
      </View>
      <View style={styles.content}>
        <View
          accessible
          accessibilityLabel={[visible ? 'The client sees this' : null, heading, body, meta].filter(Boolean).join('. ')}
          style={styles.texts}
        >
          {visible ? <Badge label={CLIENT_SEES} tone="gold" /> : null}
          {heading ? <Text variant="bodyStrong">{heading}</Text> : null}
          <Text variant="body" color={heading ? 'ink2' : 'ink'} numberOfLines={long && !expanded ? 6 : undefined}>
            {body}
          </Text>
          <Text variant="caption" color="ink4">
            {meta}
          </Text>
        </View>
        {long ? (
          <PressableScale
            onPress={() => setExpanded((e) => !e)}
            haptic={false}
            hitSlop={{ top: 12, bottom: 12 }}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Show less' : 'Show more'}
            style={styles.inlineAction}
          >
            <Text variant="label" color="gold">
              {expanded ? 'Show less' : 'Show more'}
            </Text>
          </PressableScale>
        ) : null}
        {link ? (
          <PressableScale
            onPress={() => openLink(link, viewer, colors)}
            haptic={false}
            hitSlop={{ top: 12, bottom: 12 }}
            accessibilityRole="link"
            accessibilityLabel={`Open link, ${displayUrl(link)}`}
            style={styles.inlineAction}
          >
            <Icon icon={ExternalLink} size={14} color="gold" />
            <Text variant="label" color="gold" numberOfLines={1} style={styles.linkText}>
              {displayUrl(link)}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const DOT = 10;

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', gap: space[3] },
  rail: { width: DOT, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 6 },
  line: { width: 1, flex: 1, marginTop: space[1] },
  content: { flex: 1, paddingBottom: space[5], gap: space[1] },
  texts: { gap: space[1] },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: space[1], alignSelf: 'flex-start', minHeight: 24 },
  linkText: { flexShrink: 1 },
});
