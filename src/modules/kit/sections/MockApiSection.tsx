import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getMeta } from '@/api/endpoints/session';
import { mockControls, useMockControls } from '@/api/mock/controls';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { Slider } from '@/components/form/Slider';
import { SwitchRow } from '@/components/form/Switch';
import { space } from '@/design/tokens';
import { useConnectivity } from '@/lib/connectivity';
import { env, isMockApi } from '@/lib/env';
import { notice } from '@/lib/notice';

import { Caption, Demo, Wrap } from '../kitLayout';

/** The version the "too old" switch requires: above any real build, so every request gets 426. */
const FUTURE_VERSION = '9.9.9';

export function MockApiDemos() {
  const failAll = useMockControls((s) => s.failAll);
  const offline = useMockControls((s) => s.offline);
  const expireTokens = useMockControls((s) => s.expireTokens);
  const minVersion = useMockControls((s) => s.minVersion);
  const latencyScale = useMockControls((s) => s.latencyScale);
  const failNextCount = useMockControls((s) => s.failNext.length);
  const simulatedOffline = useConnectivity((s) => s.simulatedOffline);
  const setSimulatedOffline = useConnectivity((s) => s.setSimulatedOffline);
  const [lastMs, setLastMs] = useState<number | null>(null);

  const testRequest = async () => {
    const started = Date.now();
    await getMeta();
    const ms = Date.now() - started;
    setLastMs(ms);
    notice.ok(`The API answered in ${ms}ms.`);
  };

  return (
    <>
      <Demo title="Mode" note="The switches below only change the mock adapter. Simulate offline works in both modes.">
        <Wrap>
          <Badge label={isMockApi ? 'Mock API' : 'Live API'} tone={isMockApi ? 'gold' : 'ok'} dot size="md" />
          <Badge label={`App ${env.appVersion} (${env.buildNumber})`} size="md" />
        </Wrap>
      </Demo>

      <Demo title="Failures" note="Every screen must show its real error state, never zeros." padded={false} gap={0}>
        <View style={styles.rows}>
          <SwitchRow
            label="Fail every request"
            description="500: Could not load this just now. Nothing is lost: try again in a moment."
            value={failAll}
            onValueChange={(on) => mockControls.set({ failAll: on })}
          />
          <SwitchRow
            label="Network down"
            description="Requests throw as if the phone had no connection; the banner does not know."
            value={offline}
            onValueChange={(on) => mockControls.set({ offline: on })}
          />
          <SwitchRow
            label="Expire tokens"
            description="401 on every request: the app tries a refresh, then signs you out. Reload the app to undo."
            value={expireTokens}
            onValueChange={(on) => mockControls.set({ expireTokens: on })}
          />
          <SwitchRow
            label={`Require version ${FUTURE_VERSION}`}
            description="426 on the next request: the app shows the update screen. Reload the app to leave it."
            value={minVersion === FUTURE_VERSION}
            onValueChange={(on) => mockControls.set({ minVersion: on ? FUTURE_VERSION : null })}
          />
        </View>
        <Divider />
        <View style={styles.inset}>
          <Wrap>
            <Button label="Fail the next request" variant="secondary" size="sm" onPress={() => mockControls.failNextRequest('/')} />
            {failNextCount > 0 ? <Badge label={`${failNextCount} queued`} tone="warn" /> : null}
          </Wrap>
          <Caption>One-shot: the next request, whatever it is, fails with 500.</Caption>
        </View>
      </Demo>

      <Demo title="Connection" note="The whole app as if the phone lost its connection: banner, disabled submits, cached data.">
        <SwitchRow label="Simulate offline" value={simulatedOffline} onValueChange={setSimulatedOffline} />
      </Demo>

      <Demo title="Latency" note="Multiplies the mock's own delays: 0.2x snappy, 3x a slow phone network.">
        <Slider
          label="Latency"
          value={latencyScale}
          min={0.2}
          max={3}
          step={0.1}
          format={(v) => `${v.toFixed(1)}x`}
          onChange={(v) => mockControls.set({ latencyScale: v })}
        />
        <PendingButton label="Send a test request" pendingLabel="Waiting" variant="secondary" requiresNetwork={false} onPress={testRequest} />
        <Text variant="small" color="ink3">
          {lastMs === null ? 'GET /meta through the real client, with every switch above applied.' : `Last answer: ${lastMs}ms.`}
        </Text>
      </Demo>

      <Demo title="Reset" note="Back to a healthy mock and a connected phone.">
        <Button
          label="Reset everything"
          variant="secondary"
          onPress={() => {
            mockControls.reset();
            setSimulatedOffline(false);
            notice.ok('Mock API reset.');
          }}
        />
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  rows: { paddingHorizontal: space[4] },
  inset: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2] },
});
