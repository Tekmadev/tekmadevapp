import { View } from 'react-native';

import { InboxBellButton } from '@/modules/inbox/InboxBellButton';
import { HeaderSearchButton } from '@/modules/search/HeaderSearchButton';

/** Top-right actions on every tab screen: global search, then the Inbox bell. */
export function TabHeaderActions() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <HeaderSearchButton />
      <InboxBellButton />
    </View>
  );
}
