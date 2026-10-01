import { Search } from 'lucide-react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';

/** STUB (phase 2): opens the global SearchSheet. No required props. */
export function HeaderSearchButton() {
  return (
    <PressableScale accessibilityLabel="Search" hitSlop={8} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Icon icon={Search} size={22} />
    </PressableScale>
  );
}
