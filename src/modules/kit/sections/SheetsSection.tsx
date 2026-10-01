import { Archive, Copy, Pencil, Share2, Trash2 } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { ListRow } from '@/components/ListRow';
import { Menu } from '@/components/Menu';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { ActionSheet, type ActionSheetItem } from '@/components/sheet/ActionSheet';
import { Sheet } from '@/components/sheet/Sheet';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { Caption, Demo, Wrap } from '../kitLayout';
import { delay, sampleClients } from '../sampleData';

type Open = 'content' | 'snap' | 'locked' | 'actions' | null;

const CLIENTS = sampleClients(40);

function actionItems(onTrash: () => void): ActionSheetItem[] {
  return [
    { label: 'Edit', icon: Pencil, onPress: () => notice.ok('Edit pressed.') },
    { label: 'Share link', icon: Share2, onPress: () => notice.ok('Share pressed.') },
    { label: 'Copy portal address', icon: Copy, hint: 'https://account.tekmadev.com/acme-plumbing', onPress: () => notice.ok('Copied.') },
    { label: 'Archive', icon: Archive, disabled: true, hint: 'Owner only', onPress: () => undefined },
    { label: 'Move to trash', icon: Trash2, destructive: true, onPress: onTrash },
  ];
}

export function SheetsDemos() {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  return (
    <>
      <Demo title="Sheet, sized to its content" note="Drag down, tap the backdrop or press back to close.">
        <Button label="Open a sheet" variant="secondary" onPress={() => setOpen('content')} />
      </Demo>

      <Demo title="Sheet with snap points" note="Half and full height, with a long list that scrolls inside.">
        <Button label="Open a long sheet" variant="secondary" onPress={() => setOpen('snap')} />
      </Demo>

      <Demo title="Sheet that cannot be dismissed" note="While a request runs: no drag, no backdrop, no back.">
        <Button label="Open a locked sheet" variant="secondary" onPress={() => setOpen('locked')} />
      </Demo>

      <Demo title="Action sheet and menu" note="Choosing closes the sheet first, then runs the action.">
        <Wrap gap={space[3]}>
          <Button label="Open actions" variant="secondary" onPress={() => setOpen('actions')} />
          <Menu title="Acme Plumbing" subtitle="Grow plan" items={actionItems(() => notice.ok('Trash would open a confirm sheet.'))} />
          <Menu items={[]} />
        </Wrap>
        <Caption>The overflow trigger opens the same sheet. With no items it renders nothing (the third one).</Caption>
      </Demo>

      <Sheet
        visible={open === 'content'}
        onClose={close}
        title="Payment received"
        subtitle="Acme Plumbing · Grow plan"
        footer={
          <PendingButton
            label="Send receipt"
            pendingLabel="Sending"
            fullWidth
            onPress={async () => {
              await delay(1500);
              notice.ok('Receipt sent.');
              close();
            }}
          />
        }
      >
        <Text variant="body" color="ink2">
          $77.50 from Acme Plumbing for the Grow care plan. The receipt goes to the billing email on file.
        </Text>
      </Sheet>

      <Sheet visible={open === 'snap'} onClose={close} title="Clients" subtitle="40 clients" snapPoints={[0.5, 0.92]} scrollable>
        {CLIENTS.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 ? <Divider inset={72} /> : null}
            <ListRow
              title={c.name}
              subtitle={c.city}
              avatar={{ name: c.name }}
              onPress={() => {
                notice.ok(`${c.name} chosen.`);
                close();
              }}
            />
          </Fragment>
        ))}
      </Sheet>

      <Sheet
        visible={open === 'locked'}
        onClose={close}
        title="Locked"
        dismissible={false}
        footer={<Button label="Done" fullWidth onPress={close} />}
      >
        <View style={styles.body}>
          <Text variant="body" color="ink2">
            This sheet ignores drags, the backdrop and the back button. Every sheet does this on its own while one of its submit
            buttons runs.
          </Text>
        </View>
      </Sheet>

      <ActionSheet
        visible={open === 'actions'}
        onClose={close}
        title="Acme Plumbing"
        subtitle="Grow plan"
        items={actionItems(() => notice.ok('Trash would open a confirm sheet.'))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: space[2] },
});
