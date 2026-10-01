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
