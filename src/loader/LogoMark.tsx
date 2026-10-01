import { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/design/theme';

import { LOGO_PATHS } from './logoPaths';

export type LogoMarkProps = {
  size: number;
  /** Defaults to the theme gold. */
  color?: string;
  /** Whole mark opacity, e.g. for an EmptyState watermark. Default 1. */
  opacity?: number;
};

/**
 * The static logo mark. Plain SVG rather than Skia: many can be on screen at once
 * (EmptyState watermarks, avatars, the QR centre) and none of them animate, so
 * they should not each cost a GPU surface. Gold unless told otherwise.
 */
export const LogoMark = memo(function LogoMark({ size, color, opacity = 1 }: LogoMarkProps) {
  const { colors } = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="300 300 2400 2400"
      fill={color ?? colors.gold}
      opacity={opacity}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {LOGO_PATHS.map((piece) => (
        <Path key={piece.id} d={piece.d} />
      ))}
    </Svg>
  );
});
