import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import type { ClientBundle } from '@/api/schemas/clients';
import type { Meta } from '@/api/schemas/meta';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { contactUrl } from '@/components/parts/logic';
import { useTheme, type Theme } from '@/design/theme';
import { space } from '@/design/tokens';
import { env } from '@/lib/env';
import { formatPhone } from '@/lib/format';
import { notice } from '@/lib/notice';

import { GoLiveButton } from './GoLive';
import { badgeFor, CLIENT_STATUS_FALLBACK } from './logic';

export type ClientHeaderProps = {
  bundle: ClientBundle;
  meta: Meta | undefined;
};

/** The portal home for this client, as long as it is on the portal's own site; otherwise the portal itself. */
function portalUrl(url: string): string {
  return url.startsWith(`${env.portalUrl}/`) || url === env.portalUrl ? url : env.portalUrl;
}

function openPortal(url: string, colors: Theme['colors']) {
  WebBrowser.openBrowserAsync(portalUrl(url), {
    toolbarColor: colors.bg,
    secondaryToolbarColor: colors.bg,
    showTitle: true,
    enableBarCollapsing: true,
  }).catch(() => notice.err('Could not open the portal.'));
}

async function copy(value: string) {
  try {
    await Clipboard.setStringAsync(value);
    notice.ok('Copied.');
  } catch {
    notice.err('Could not copy that.');
  }
}

/** An email or phone number in the header: tap to write or call, long press to copy. */
function ContactLink({ kind, value }: { kind: 'email' | 'phone'; value: string }) {
  const shown = kind === 'phone' ? formatPhone(value) : value;
  const url = contactUrl(kind, value);
  if (!url) {
    return (
      <Text variant="body" color="ink3" selectable>
        {shown}
      </Text>
    );
  }
  return (
    <PressableScale
      pressedScale={0.98}
      hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
      onPress={() => {
        Linking.openURL(url).catch(() => void copy(value));
      }}
      onLongPress={() => void copy(value)}
      accessibilityRole="link"
      accessibilityLabel={kind === 'phone' ? `Call ${shown}` : `Email ${shown}`}
      accessibilityHint="Long press to copy."
    >
      <Text variant="body" color="gold" numberOfLines={1}>
        {shown}
      </Text>
    </PressableScale>
  );
}

function Dot() {
  return (
    <Text variant="body" color="ink4" importantForAccessibility="no">
      ·
    </Text>
  );
}

/**
 * Under the large business name: plan · email · phone, the status, Blocked
 * and Test badges, then Go live (until the client is live) and Open portal.
 */
export function ClientHeader({ bundle, meta }: ClientHeaderProps) {
  const { colors } = useTheme();
  const { client } = bundle;
  const run = bundle.onboarding?.run ?? null;
  const status = badgeFor(meta?.clientStatuses, client.status, CLIENT_STATUS_FALLBACK);
  const blocked = Boolean(run?.blocked && !run.completedAt);
  const canGoLive = client.status !== 'live';

  return (
    <View style={styles.wrap}>
      <View style={styles.contact}>
        <Text variant="body" color="ink3">
          {client.planName ?? 'No plan yet'}
        </Text>
        <Dot />
        <ContactLink kind="email" value={client.primaryEmail} />
        {client.phone ? (
          <>
            <Dot />
            <ContactLink kind="phone" value={client.phone} />
          </>
        ) : null}
      </View>

      <View style={styles.badges}>
        <Badge label={status.label} tone={status.tone} size="md" dot />
        {blocked ? <Badge label="Blocked" tone="signal" size="md" /> : null}
        {client.isTest ? <Badge label="Test" tone="neutral" size="md" /> : null}
      </View>

      <View style={styles.actions}>
        {canGoLive ? <GoLiveButton clientId={client.id} style={styles.action} /> : null}
        <Button
          label="Open portal"
          variant="secondary"
          icon={ExternalLink}
          accessibilityHint="Opens the client portal in the browser"
          onPress={() => openPortal(client.portalUrl, colors)}
          style={canGoLive ? styles.action : styles.single}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[4], marginBottom: space[5] },
  contact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2], rowGap: space[1] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  // Side by side when they fit; at large font sizes the second wraps under the first.
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space[3] },
  action: { flexGrow: 1 },
  single: { alignSelf: 'flex-start' },
});
