import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { QrCode, type QrCodeHandle } from '@/components/QrCode';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { Caption, Demo, Labeled, Wrap } from '../kitLayout';

const START = 'https://www.tekmadev.com/start';

export function QrDemos() {
  const qr = useRef<QrCodeHandle>(null);

  const snapshot = async () => {
    const uri = await qr.current?.snapshot('tekmadev-start');
    if (uri) notice.ok('Saved a PNG to the cache.');
    else notice.err('Could not save the PNG.');
  };

  return (
    <>
      <Demo title="QR code" note="Dark on white in both themes on purpose: scanners and printers need it.">
        <View style={styles.center}>
          <QrCode ref={qr} value={START} />
        </View>
        <Caption>{START}</Caption>
        <Button label="Save as PNG" variant="secondary" size="sm" onPress={() => void snapshot()} />
      </Demo>

      <Demo title="QR code, small and plain" note="160dp, and without the centre mark.">
        <Wrap gap={space[4]} align="flex-end">
          <Labeled label="160dp">
            <QrCode value={START} size={160} />
          </Labeled>
          <Labeled label="no mark">
            <QrCode value={START} size={120} logo={false} />
          </Labeled>
        </Wrap>
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
});
