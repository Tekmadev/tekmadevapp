import { Share } from 'react-native';

import { MESSAGES } from '@/api/errors';
import { Button } from '@/components/Button';
import { ToastCard } from '@/components/Toast';
import { notice } from '@/lib/notice';

import { Caption, Demo, Wrap } from '../kitLayout';

const OK = 'Saved. A version snapshot was recorded.';
const ERR = 'Meta refused the pull. The inbox has the reason; an expired token is the usual cause.';
const LINK = 'https://www.tekmadev.com/start';
const WITH_ACTION = `Link created. Share ${LINK}`;

function share() {
  Share.share({ message: LINK }).catch(() => notice.err(MESSAGES.generic));
}

export function ToastsDemos() {
  return (
    <>
      <Demo title="Live toasts" note="Slide down from the top, auto-dismiss after 3.5s, swipe up to dismiss.">
        <Wrap>
          <Button label="Ok" variant="secondary" size="sm" onPress={() => notice.ok(OK)} />
          <Button label="Error" variant="secondary" size="sm" onPress={() => notice.err(ERR)} />
          <Button
            label="With action"
            variant="secondary"
            size="sm"
            onPress={() => notice.ok(WITH_ACTION, { action: { label: 'Share', onPress: share } })}
          />
          <Button label="Offline" variant="secondary" size="sm" onPress={() => notice.err(MESSAGES.network)} />
        </Wrap>
        <Caption>Two show at once; the same message twice replaces the first.</Caption>
      </Demo>

      <Demo title="Toast surfaces" note="ok has a gold edge and a check, err a signal edge and an alert icon.">
        <ToastCard tone="ok" message={OK} />
        <ToastCard tone="err" message={ERR} />
        <ToastCard tone="ok" message={WITH_ACTION} action={{ label: 'Share', onPress: share }} />
      </Demo>
    </>
  );
}
