import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { initials } from '@/lib/format';

import { Text } from './Text';

export const AVATAR_SIZES = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 } as const;
export type AvatarSize = keyof typeof AVATAR_SIZES;

export type AvatarProps = {
  /** Person or company name: the fallback letter and what TalkBack reads. */
  name?: string | null;
  /** Photo or logo URL; the letter shows until it loads and if it fails. */
  uri?: string | null;
  size?: AvatarSize | number;
  /** One letter (default) or two ("AP"). */
  letters?: 1 | 2;
  /** Decorative next to a visible name (default): TalkBack skips it. */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A round photo with an initial on gold tint underneath, so a missing or broken image still reads. */
export function Avatar({ name, uri, size = 'md', letters = 1, decorative = true, style, testID }: AvatarProps) {
  const { colors, isDark } = useTheme();
  const px = typeof size === 'number' ? size : AVATAR_SIZES[size];
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(uri) && failedUri !== uri;
  const all = initials(name);
  const text = letters === 2 ? all : (Array.from(all)[0] ?? '');

  return (
    <View
      testID={testID}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : (name ?? undefined)}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      style={[
        styles.circle,
        { width: px, height: px, backgroundColor: colors.goldTint, borderColor: colors.line },
        style,
      ]}
    >
      {text ? (
        <Text
          variant="title"
          weight="600"
          align="center"
          style={{
            color: isDark ? colors.goldMid : colors.goldDeep,
            fontSize: Math.round(px * (letters === 2 ? 0.36 : 0.42)),
            lineHeight: Math.round(px * 0.5),
            letterSpacing: 0,
          }}
          maxFontSizeMultiplier={1}
        >
          {text}
        </Text>
      ) : null}
      {showImage && uri ? (
        <Image
          source={{ uri }}
          recyclingKey={uri}
          contentFit="cover"
          transition={150}
          onError={() => setFailedUri(uri)}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
