import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Asset } from '@/api/schemas/clients';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { durations, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { InlineLoader } from '@/loader/InlineLoader';

import { extensionOf, fileFamily, fileIcon } from './fileTypes';

export type FileTileProps = {
  asset: Asset;
  /** A thumbnail URL that is valid right now (null: no thumbnail, or still being re-signed). */
  thumbnailUrl: string | null;
  /** "Photo · 2.5 MB". */
  meta: string;
  /** A fresh link is being fetched before the file opens. */
  opening?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** One file in the Files grid: a thumbnail for images, a file-type icon for the rest. */
export function FileTile({ asset, thumbnailUrl, meta, opening = false, onPress, style }: FileTileProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const [broken, setBroken] = useState<string | null>(null);
  const family = fileFamily(asset.mime, asset.fileName);
  const ext = extensionOf(asset.fileName);
  const isImage = family === 'image';
  const showThumb = thumbnailUrl != null && broken !== thumbnailUrl;

  return (
    <PressableScale
      onPress={onPress}
      disabled={opening}
      accessibilityRole="button"
      accessibilityLabel={`${asset.fileName}, ${meta}`}
      accessibilityHint={isImage ? 'Opens the image' : 'Opens the file in the browser'}
      accessibilityState={{ busy: opening, disabled: opening }}
      style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.line }, style]}
    >
      <View style={[styles.preview, { backgroundColor: colors.bg3 }]}>
        {showThumb ? (
          <Image
            source={{ uri: thumbnailUrl, cacheKey: `asset-thumb-${asset.id}` }}
            recyclingKey={asset.id}
            contentFit="cover"
            transition={reduceMotion ? null : durations.fast}
            onError={() => setBroken(thumbnailUrl)}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        ) : (
          <View style={styles.iconWrap}>
            <Icon icon={thumbnailUrl != null && broken === thumbnailUrl ? ImageOff : fileIcon(family)} size={30} color="ink3" strokeWidth={1.5} />
            {ext ? (
              <Text variant="caption" color="ink3" style={styles.ext}>
                {ext}
              </Text>
            ) : null}
          </View>
        )}
        {opening ? (
          <View style={[styles.opening, { backgroundColor: colors.scrim }]}>
            <InlineLoader size={18} />
          </View>
        ) : null}
      </View>
      <View style={styles.caption}>
        <Text variant="label" weight="600" numberOfLines={1} ellipsizeMode="middle">
          {asset.fileName}
        </Text>
        <Text variant="small" color="ink3" numberOfLines={1} tabular>
          {meta}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  preview: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  iconWrap: { alignItems: 'center', gap: space[1] },
  ext: { letterSpacing: 0.8 },
  opening: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  caption: { paddingHorizontal: space[3], paddingTop: space[2], paddingBottom: space[3], gap: 2 },
});
