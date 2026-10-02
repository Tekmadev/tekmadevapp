import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import type { Asset } from '@/api/schemas/clients';
import { openInBrowser } from '@/components/automation';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Section } from '@/components/Section';
import { reportSubmitError } from '@/components/SubmitGroup';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { formatBytes } from '@/lib/format';
import { toDate } from '@/lib/dates';

import { freshAssetUrl, isExpired, signedAssetQuery } from './files/assetSigning';
import { FileTile } from './files/FileTile';
import { opensInViewer } from './files/fileTypes';
import { ImageViewer } from './files/ImageViewer';
import { ASSET_KIND_LABELS, labelFrom, useBundleCache, useMeta } from './files/shared';
import type { SectionProps } from './types';

/** Phones get two columns; a tablet or a phone in landscape gets three. */
const columnsFor = (width: number) => (width >= 600 ? 3 : 2);

function newestFirst(a: Asset, b: Asset) {
  return (toDate(b.uploadedAt)?.getTime() ?? 0) - (toDate(a.uploadedAt)?.getTime() ?? 0);
}

/**
 * Files (brief 8.5, section 4): what the client uploaded, as a grid of
 * thumbnails and file-type icons. Images open in the full-screen viewer, other
 * files in a Custom Tab. Signed URLs expire, so an expired one is re-signed
 * before anything loads it.
 */
export function FilesSection({ clientId, bundle }: SectionProps) {
  const { colors } = useTheme();
  const meta = useMeta();
  const { width } = useWindowDimensions();
  const { queryClient } = useBundleCache(clientId);

  const assets = [...bundle.assets].sort(newestFirst);
  const columns = columnsFor(width);

  // Thumbnails whose signature ran out are re-signed (once per expiry, shared with the viewer).
  const expiredThumbs = assets.filter((a) => a.thumbnailUrl != null && isExpired(a.expiresAt));
  const signed = useQueries({
    queries: expiredThumbs.map((a) => signedAssetQuery(queryClient, clientId, a.id)),
  });
  const freshThumb = (asset: Asset): string | null => {
    if (asset.thumbnailUrl == null) return null;
    if (!isExpired(asset.expiresAt)) return asset.thumbnailUrl;
    const result = signed[expiredThumbs.findIndex((a) => a.id === asset.id)];
    if (result?.data) return result.data.thumbnailUrl;
    // Re-signing failed (offline, most often): the old URL still finds a thumbnail cached on the device.
    return result?.isError ? asset.thumbnailUrl : null;
  };

  const [opening, setOpening] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ id: string; open: boolean; session: number } | null>(null);

  const metaLine = (asset: Asset) =>
    [labelFrom(meta?.assetKinds, ASSET_KIND_LABELS, asset.kind), formatBytes(asset.sizeBytes)].filter(Boolean).join(' · ');

  const open = async (asset: Asset) => {
    if (opening) return;
    if (opensInViewer(asset)) {
      setViewer((v) => ({ id: asset.id, open: true, session: (v?.session ?? 0) + 1 }));
      return;
    }
    setOpening(asset.id);
    try {
      const url = await freshAssetUrl(queryClient, clientId, asset);
      openInBrowser(url, colors);
    } catch (error) {
      reportSubmitError(error);
    } finally {
      setOpening(null);
    }
  };

  const viewed = viewer ? (bundle.assets.find((a) => a.id === viewer.id) ?? null) : null;

  const rows: Asset[][] = [];
  for (let i = 0; i < assets.length; i += columns) rows.push(assets.slice(i, i + columns));

  return (
    <Section title={`Files (${assets.length})`}>
      {assets.length === 0 ? (
        <Card padded={false}>
          <EmptyState compact message="Nothing uploaded yet." />
        </Card>
      ) : (
        <View style={styles.grid}>
          {rows.map((row) => (
            <View key={row[0].id} style={styles.row}>
              {row.map((asset) => (
                <FileTile
                  key={asset.id}
                  asset={asset}
                  thumbnailUrl={freshThumb(asset)}
                  meta={metaLine(asset)}
                  opening={opening === asset.id}
                  onPress={() => void open(asset)}
                />
              ))}
              {Array.from({ length: columns - row.length }, (_, i) => (
                <View key={`spacer-${i}`} style={styles.spacer} />
              ))}
            </View>
          ))}
        </View>
      )}

      <ImageViewer
        clientId={clientId}
        asset={viewed}
        session={viewer?.session ?? 0}
        open={viewer?.open === true && viewed != null}
        subtitle={viewed ? metaLine(viewed) : ''}
        onClose={() => setViewer((v) => (v ? { ...v, open: false } : v))}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space[3] },
  row: { flexDirection: 'row', gap: space[3] },
  spacer: { flex: 1 },
});
