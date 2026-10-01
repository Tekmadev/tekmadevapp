import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { ToastStack } from '../Toast';
import { OverlayRootContext, SheetStoreContext, type OverlayRoot } from './context';
import { createSheetStore, topOpenEntry, type SheetEntry, type SheetStore } from './sheetStore';
import { SheetView } from './SheetView';

/**
 * The overlay root, mounted once around the navigator. It draws, in order:
 * the app, the stack of open sheets (above every screen and the tab bar), then
 * the toasts (above the sheets, so a failed save inside a sheet is still seen).
 * Everything stays in the activity's window, so FLAG_SECURE covers it.
 *
 * While a sheet is open the app underneath is hidden from TalkBack and Android
 * back (including predictive back) closes the topmost sheet.
 */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSheetStore);
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const anyOpen = topOpenEntry(entries) != null;

  const [toastHosts, setToastHosts] = useState(0);
  const overlay = useMemo<OverlayRoot>(
    () => ({
      hostToasts: () => {
        setToastHosts((n) => n + 1);
        return () => setToastHosts((n) => n - 1);
      },
    }),
    [],
  );

  // Added while a sheet is open, so it runs before any back handler a screen registered earlier.
  useEffect(() => {
    if (!anyOpen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => store.dismissTop());
    return () => subscription.remove();
  }, [anyOpen, store]);

  return (
    <SheetStoreContext.Provider value={store}>
      <OverlayRootContext.Provider value={overlay}>
        <View style={styles.fill} importantForAccessibility={anyOpen ? 'no-hide-descendants' : 'auto'}>
          {children}
        </View>
        <SheetLayer entries={entries} store={store} />
        {toastHosts > 0 ? <ToastStack /> : null}
      </OverlayRootContext.Provider>
    </SheetStoreContext.Provider>
  );
}

/** Always mounted (and touch-transparent) so its size is known before the first sheet opens. */
function SheetLayer({ entries, store }: { entries: readonly SheetEntry[]; store: SheetStore }) {
  const { height: windowHeight } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const layerHeight = measured || windowHeight;
  const top = topOpenEntry(entries);

  const onLayout = (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.height);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" collapsable={false} onLayout={onLayout}>
      {entries.map((entry) => (
        <SheetView key={entry.id} entry={entry} store={store} layerHeight={layerHeight} isTop={entry === top} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
