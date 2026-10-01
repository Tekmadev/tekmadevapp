import type { LucideIcon } from 'lucide-react-native';

import { useTheme } from '@/design/theme';
import type { Palette, Tone } from '@/design/tokens';

export type IconProps = {
  icon: LucideIcon;
  size?: number;
  /** Palette colour name (default ink2) or a tone's text colour. */
  color?: keyof Palette;
  tone?: Tone;
  /** Raw colour override (e.g. a button's text colour). */
  rawColor?: string;
  strokeWidth?: number;
};

/** Lucide icons, themed. Stroke 1.75 by default (2.25 for active/emphasis). */
export function Icon({ icon: Glyph, size = 20, color = 'ink2', tone, rawColor, strokeWidth = 1.75 }: IconProps) {
  const { colors, tones } = useTheme();
  const c = rawColor ?? (tone ? tones[tone].text : (colors[color] as string));
  return <Glyph size={size} color={c} strokeWidth={strokeWidth} />;
}
