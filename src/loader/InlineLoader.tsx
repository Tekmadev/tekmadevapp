import { memo } from 'react';

import { BlackHole } from './BlackHole';
import { useLoaderSettings } from './settings';

export type InlineLoaderProps = {
  /** 14 to 16dp. Default 16. */
  size?: number;
  /** Defaults to the theme gold. */
  color?: string;
};

/**
 * Row-level loading (14 to 16dp), e.g. a row being saved. Small marks read better
 * on the quicker button beat, so it uses `buttonBeatMs`. Gold unless told otherwise.
 */
export const InlineLoader = memo(function InlineLoader({ size = 16, color }: InlineLoaderProps) {
  const { buttonBeatMs } = useLoaderSettings();
  return <BlackHole size={size} color={color} beatMs={buttonBeatMs} accessibilityLabel="Loading" />;
});
