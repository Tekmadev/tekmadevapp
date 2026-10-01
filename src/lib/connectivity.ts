import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

/**
 * Online / offline state shared by the API client, TanStack Query and the
 * offline banner. "Offline" means no connection or no internet reachability.
 */

type ConnectivityState = {
  online: boolean;
  /** Simulated offline (mock mode, Kit screen) for checking offline states. */
  simulatedOffline: boolean;
  setSimulatedOffline: (on: boolean) => void;
};

const isOnlineState = (state: NetInfoState) =>
  state.isConnected !== false && state.isInternetReachable !== false;

export const useConnectivity = create<ConnectivityState>()((set) => ({
  online: true,
  simulatedOffline: false,
  setSimulatedOffline: (simulatedOffline) => set({ simulatedOffline }),
}));

let started = false;
export function startConnectivity() {
  if (started) return;
  started = true;
  NetInfo.addEventListener((state) => {
    useConnectivity.setState({ online: isOnlineState(state) });
  });
}

export const connectivity = {
  isOnline: () => {
    const s = useConnectivity.getState();
    return s.online && !s.simulatedOffline;
  },
};

/** True when the device can reach the network (and offline is not being simulated). */
export function useIsOnline(): boolean {
  return useConnectivity((s) => s.online && !s.simulatedOffline);
}
