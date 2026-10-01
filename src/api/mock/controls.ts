import { create } from 'zustand';

/**
 * Dev-only switches for the mock adapter (Kit screen, "Mock API" section), so
 * every failure, offline and upgrade state can be seen without a real server.
 */

export type FailRule = { id: number; pathPrefix: string; status: number };

type ControlsState = {
  /** Every mock request fails with 500 `unavailable`. */
  failAll: boolean;
  /** One-shot failures for the next request whose path starts with the prefix. */
  failNext: FailRule[];
  /** Network requests throw as if the phone were offline. */
  offline: boolean;
  /** Mock tokens are rejected with 401 (exercises refresh, then sign-out). */
  expireTokens: boolean;
  /** Requests from an app below this version get 426. */
  minVersion: string | null;
  /** Multiplies mock latency (0.2 = snappy, 3 = slow phone network). */
  latencyScale: number;
};

export const useMockControls = create<ControlsState>()(() => ({
  failAll: false,
  failNext: [],
  offline: false,
  expireTokens: false,
  minVersion: null,
  latencyScale: 1,
}));

let ruleId = 0;

export const mockControls = {
  get state() {
    return useMockControls.getState();
  },
  set(partial: Partial<ControlsState>) {
    useMockControls.setState(partial);
  },
  failNextRequest(pathPrefix: string, status = 500) {
    ruleId += 1;
    useMockControls.setState((s) => ({ failNext: [...s.failNext, { id: ruleId, pathPrefix, status }] }));
  },
  consumeFailure(rule: FailRule) {
    useMockControls.setState((s) => ({ failNext: s.failNext.filter((r) => r.id !== rule.id) }));
  },
  reset() {
    useMockControls.setState({ failAll: false, failNext: [], offline: false, expireTokens: false, minVersion: null, latencyScale: 1 });
  },
};
