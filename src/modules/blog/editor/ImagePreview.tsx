import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

export type ImagePreviewProps = {
  url: string;
  /** What TalkBack reads, and what shows when the image cannot load. */
  alt: string;
  /** Width over height (16:9 by default; social cards are 1.91). */
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A fixed-ratio frame for an image URL (cover, social card, an image block), so
 * nothing jumps while it loads. A URL that does not load shows a calm fallback
 * with the alt text. Give it `key={url}` so a new URL gets a fresh try.
 */
export function ImagePreview({ url, alt, aspectRatio = 16 / 9, style }: ImagePreviewProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.frame, { aspectRatio, backgroundColor: colors.bg3, borderColor: colors.line }, style]}>
      {failed ? (
        <View style={styles.fallback} accessible accessibilityLabel={alt ? `Image could not load. ${alt}` : 'Image could not load.'}>
          <Icon icon={ImageOff} size={22} color="ink4" />
          <Text variant="small" color="ink3" align="center" numberOfLines={3}>
            {alt ? `Image could not load. ${alt}` : 'Image could not load.'}
          </Text>
        </View>
      ) : (
        <Image
          source={{ uri: url }}
          accessibilityLabel={alt || undefined}
          accessible={!!alt}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[2], padding: space[4] },
});
