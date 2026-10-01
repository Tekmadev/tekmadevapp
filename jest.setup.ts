/* Global test setup: deterministic mock latency and quiet native modules. */
import { mockControls } from '@/api/mock/controls';

mockControls.set({ latencyScale: 0 });

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

jest.mock('expo-application', () => ({ nativeApplicationVersion: '0.1.0', nativeBuildVersion: '1' }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => undefined, fetch: async () => ({ isConnected: true }) }));

// MMKV is a Nitro native module; give tests an in-memory store with the same surface.
jest.mock('react-native-mmkv', () => {
  const make = (config?: { id?: string }) => {
    const data = new Map<string, string | number | boolean>();
    return {
      id: config?.id ?? 'mmkv.default',
      set: (k: string, v: string | number | boolean) => void data.set(k, v),
      getString: (k: string) => {
        const v = data.get(k);
        return typeof v === 'string' ? v : undefined;
      },
      getNumber: (k: string) => {
        const v = data.get(k);
        return typeof v === 'number' ? v : undefined;
      },
      getBoolean: (k: string) => {
        const v = data.get(k);
        return typeof v === 'boolean' ? v : undefined;
      },
      contains: (k: string) => data.has(k),
      remove: (k: string) => data.delete(k),
      getAllKeys: () => [...data.keys()],
      clearAll: () => data.clear(),
      addOnValueChangedListener: () => ({ remove: () => undefined }),
    };
  };
  return { createMMKV: make, existsMMKV: () => false, deleteMMKV: () => true };
});
