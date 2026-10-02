import { useQuery } from '@tanstack/react-query';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Download, Share2 } from 'lucide-react-native';
import { useRef, type ReactNode } from 'react';
import { Linking, StyleSheet, useWindowDimensions, View } from 'react-native';

import { linksMetaQuery, linksQuery } from '@/api/endpoints/links';
import { MESSAGES } from '@/api/errors';
import type { LinksMeta, ShortLink } from '@/api/schemas/links';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { Badge } from '@/components/Badge';
import { ErrorState } from '@/components/ErrorState';
import { PendingButton } from '@/components/PendingButton';
import { QrCode, type QrCodeHandle } from '@/components/QrCode';
import { Screen } from '@/components/Screen';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { useRefetchOnFocus } from '@/modules/overview/hooks';

import { LINK_COPY, shareUrlOf, shortLinkText, statusBadge } from './logic';

const oneParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** The code never grows past this on tablets: bigger does not scan better. */
const MAX_QR = 360;

/**
 * Share: the QR card as a PNG in the cache directory, handed to the system
 * share sheet. Save: the same PNG into the photo library. On Android the
 * write-only request asks for nothing on Android 13 and newer (READ_MEDIA_* are
 * blocked in app.json on purpose) and for WRITE_EXTERNAL_STORAGE before that;
 * on iOS it is the add-only photos permission.
 */
async function sharePng(qr: QrCodeHandle | null, slug: string) {
  const uri = await qr?.snapshot(`tekmadev-qr-${slug}`);
  if (!uri) {
    haptics.error();
    notice.err('Could not make the QR image. Try again.');
    return;
  }
  try {
    if (!(await Sharing.isAvailableAsync())) {
      notice.err('Sharing is not available on this phone.');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `QR code for ${shortLinkText(slug)}` });
  } catch {
    haptics.error();
    notice.err('Could not open the share sheet.');
  }
}

async function savePng(qr: QrCodeHandle | null, slug: string) {
  let permission: MediaLibrary.PermissionResponse;
  try {
    permission = await MediaLibrary.requestPermissionsAsync(true);
  } catch {
    haptics.error();
    notice.err('Could not save the QR code. Try again.');
    return;
  }
  if (!permission.granted) {
    haptics.error();
    notice.err(
      'Allow Tekmadev to add photos to save the QR code.',
      permission.canAskAgain ? undefined : { action: { label: 'Settings', onPress: () => void Linking.openSettings() } },
    );
    return;
  }
  const uri = await qr?.snapshot(`tekmadev-qr-${slug}`);
  if (!uri) {
    haptics.error();
    notice.err('Could not make the QR image. Try again.');
    return;
  }
  try {
    await MediaLibrary.saveToLibraryAsync(uri);
    haptics.success();
    notice.ok('QR code saved to your photos.');
  } catch {
    haptics.error();
    notice.err('Could not save the QR code. Try again.');
  }
}

function QrBody({ link, meta }: { link: ShortLink; meta: LinksMeta | undefined }) {
  const qr = useRef<QrCodeHandle>(null);
  const { width } = useWindowDimensions();
  const size = Math.min(width - layout.gutter * 2, MAX_QR);
  const url = shareUrlOf(link);
  const status = statusBadge(meta, link.active);

  return (
    <View style={styles.body}>
      <View style={styles.titles}>
        <Text variant="monoLarge" align="center" selectable>
          {shortLinkText(link.slug)}
        </Text>
        {link.label ? (
          <Text variant="small" color="ink3" align="center">
            {link.label}
          </Text>
        ) : null}
      </View>

      <QrCode ref={qr} value={url} size={size} accessibilityLabel={`QR code that opens ${url}`} />

      <View style={styles.titles}>
        <Text variant="mono" color="ink3" align="center" selectable>
          {url}
        </Text>
        {link.active ? null : (
          <>
            <Badge label={status.label} tone={status.tone} dot />
            <Text variant="small" color="ink3" align="center">
              {LINK_COPY.disabledNote}
            </Text>
          </>
        )}
      </View>

      <View style={[styles.actions, { width: size }]}>
        <PendingButton
          label="Share"
          pendingLabel="Sharing"
          icon={Share2}
          fullWidth
          requiresNetwork={false}
          onPress={() => sharePng(qr.current, link.slug)}
        />
        <PendingButton
          label="Save"
          pendingLabel="Saving"
          icon={Download}
          variant="secondary"
          fullWidth
          requiresNetwork={false}
          accessibilityHint="Saves the QR code to your photos as a PNG"
          onPress={() => savePng(qr.current, link.slug)}
        />
      </View>
    </View>
  );
}

function QrSkeleton() {
  const { width } = useWindowDimensions();
  const size = Math.min(width - layout.gutter * 2, MAX_QR);
  return (
    <SkeletonGroup style={styles.body}>
      <Skeleton width={180} height={20} />
      <Skeleton shape="block" width={size} height={size} />
      <Skeleton width={220} height={14} />
    </SkeletonGroup>
  );
}

/**
 * Full-screen QR code of https://www.tekmadev.com/<slug> (brief 8.11): dark
 * modules on white in both themes so it always scans and prints, error
 * correction H with the gold mark on a small plate in the centre, and a quiet
 * zone. Share sends it as a PNG; Save puts it in the photo library. Works
 * offline from the cached links.
 */
export function LinkQrScreen() {
  return (
    <OwnerOnly>
      <LinkQr />
    </OwnerOnly>
  );
}

function LinkQr() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = oneParam(params.id) ?? '';
  const online = useIsOnline();
  const links = useQuery(linksQuery());
  const meta = useQuery(linksMetaQuery());
  useRefetchOnFocus((options) => (id ? links.refetch(options) : undefined), links.dataUpdatedAt);

  const link = links.data?.find((l) => l.id === id);

  let body: ReactNode;
  if (!id) {
    body = <ErrorState message={MESSAGES.notFound} />;
  } else if (link) {
    body = <QrBody link={link} meta={meta.data} />;
  } else if (links.data !== undefined && !links.isFetching) {
    body = <ErrorState message={LINK_COPY.notFound} />;
  } else if (links.isPending && links.fetchStatus === 'paused') {
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => links.refetch() : undefined} />;
  } else if (links.isError && links.data === undefined) {
    body = <ErrorState error={links.error} onRetry={() => links.refetch()} />;
  } else {
    body = <QrSkeleton />;
  }

  return (
    <Screen title="QR code" largeTitle={false} back>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: space[5], paddingTop: space[4], paddingBottom: space[6] },
  titles: { alignItems: 'center', gap: space[2] },
  actions: { gap: space[2] },
});
