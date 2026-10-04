import * as Clipboard from 'expo-clipboard';
import { Ban, Copy, Share2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import type { Coupon, CouponsMeta } from '@/api/schemas/coupons';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { couponActions, couponFace, type CouponAccess, type CouponFaceData } from './logic';

async function copyText(value: string) {
  try {
    await Clipboard.setStringAsync(value);
    notice.ok('Copied.');
  } catch {
    notice.err('Could not copy that.');
  }
}

/** The system share sheet with the deal link (Android takes it as text, iOS as a URL). */
function shareLink(url: string, code: string) {
  const content = Platform.OS === 'ios' ? { url } : { message: url };
  Share.share(content, { dialogTitle: `Share the ${code} deal` }).catch(() => notice.err('Could not open the share sheet.'));
}

type FaceProps = {
  face: CouponFaceData;
  /** Tap the code to copy it (list rows); off in the preview. */
  copyable?: boolean;
  children?: ReactNode;
};

/**
 * How a coupon reads (brief 8.13): the code in mono (tap to copy), the status
 * badge, the discount and what it applies to, the internal label, then
 * duration, redeemed and expiry. Shared by the list and the New coupon
 * sheet's live preview, so the preview is exactly what the list will show.
 */
export function CouponFace({ face, copyable = false, children }: FaceProps) {
  const code = face.code;
  const codeText = (
    <Text variant="monoLarge" color={code ? 'ink' : 'ink4'} style={styles.codeText} numberOfLines={2}>
      {code ?? 'Auto code'}
    </Text>
  );
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        {copyable && code ? (
          <PressableScale
            onPress={() => copyText(code)}
            accessibilityRole="button"
            accessibilityLabel={`Code ${code}`}
            accessibilityHint="Copies the code"
            style={styles.code}
          >
            {codeText}
            <Icon icon={Copy} size={16} color="ink3" />
          </PressableScale>
        ) : (
          <View style={styles.code} accessible accessibilityLabel={code ? `Code ${code}` : 'Code picked automatically'}>
            {codeText}
          </View>
        )}
        <Badge label={face.badge.label} tone={face.badge.tone} />
      </View>
      <View style={styles.what}>
        <Text variant="title" tabular>
          {face.discount}
        </Text>
        <Text variant="body" color="ink2">
          {face.appliesTo}
        </Text>
        {face.label ? (
          <Text variant="small" color="ink3" numberOfLines={2}>
            {face.label}
          </Text>
        ) : null}
      </View>
      <View style={styles.facts}>
        <Fact label="Duration" value={face.duration} />
        <Fact label="Redeemed" value={face.redeemed} />
        <Fact label="Expires" value={face.expires} />
      </View>
      {children}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color="ink3">
        {label}
      </Text>
      <Text variant="bodyStrong" tabular>
        {value}
      </Text>
    </View>
  );
}

type CardProps = {
  coupon: Coupon;
  meta: CouponsMeta | undefined;
  now: Date;
  online: boolean;
  /** `coupons.share` (deal link) and `coupons.write` (Disable). */
  access: CouponAccess;
  onDisable: (coupon: Coupon) => void;
};

/**
 * A coupon in the list. Active coupons get "Disable" (it asks for a
 * HoldToConfirm; there is no re-enable; `coupons.write`), and, when the API
 * sent a deal link (growth plans monthly or Anything), "Copy deal link" and
 * Share (`coupons.share`). With neither, the card ends at its facts.
 */
export function CouponCard({ coupon, meta, now, online, access, onDisable }: CardProps) {
  const face = couponFace(coupon, meta, now);
  const { dealUrl, disable } = couponActions(coupon, access);
  return (
    <CouponFace face={face} copyable>
      {dealUrl || disable ? (
        <>
          <Divider />
          <View style={styles.actions}>
            {dealUrl ? (
              <>
                <Button label="Copy deal link" icon={Copy} variant="secondary" size="sm" onPress={() => copyText(dealUrl)} />
                <Button
                  label="Share"
                  icon={Share2}
                  variant="secondary"
                  size="sm"
                  onPress={() => shareLink(dealUrl, coupon.code)}
                  accessibilityHint="Shares the deal link"
                />
              </>
            ) : null}
            {disable ? (
              <Button
                label="Disable"
                icon={Ban}
                variant="ghost"
                size="sm"
                disabled={!online}
                onPress={() => onDisable(coupon)}
                accessibilityHint={online ? 'Asks you to confirm' : 'You are offline'}
                style={styles.disable}
              />
            ) : null}
          </View>
        </>
      ) : null}
    </CouponFace>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  code: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexShrink: 1, marginRight: 'auto', minHeight: 32 },
  codeText: { flexShrink: 1 },
  what: { gap: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[2] },
  fact: { flexGrow: 1, flexBasis: '28%', minWidth: 88, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  disable: { marginLeft: 'auto' },
});
