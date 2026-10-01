import { View } from 'react-native';

export type PageLoaderProps = {
  /** Default 72dp. */
  size?: number;
  /** Override the `showAfterMs` delay (stays invisible this long, then fades in over 250ms). */
  delayMs?: number;
  /** Optional caption under the mark (e.g. "Pulling from Meta"). */
  label?: string;
};

/** STUB (replaced by the loader work): full-area loader, centred, appears only after showAfterMs. */
export function PageLoader(_props: PageLoaderProps) {
  return <View style={{ flex: 1 }} />;
}
