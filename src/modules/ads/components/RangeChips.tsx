import { StyleSheet } from 'react-native';

import { ADS_RANGES, type AdsRange } from '@/api/schemas/ads';
import { FilterChips } from '@/components/FilterChips';
import { space } from '@/design/tokens';

import { setAdsRange } from '../rangeStore';

/** 7d, 14d, 30d (default), 3 months, All (the last 12 months). One is always on. */
export function RangeChips({ value }: { value: AdsRange }) {
  return (
    <FilterChips
      items={ADS_RANGES}
      value={value}
      onChange={(next) => {
        if (next) setAdsRange(next);
      }}
      accessibilityLabel="Date range"
      style={styles.chips}
    />
  );
}

const styles = StyleSheet.create({
  chips: { marginBottom: space[4] },
});
