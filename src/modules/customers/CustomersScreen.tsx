import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { TabHeaderActions } from '@/modules/shell/TabHeaderActions';

export function CustomersScreen() {
  return <PlaceholderScreen title="Customers" headerRight={<TabHeaderActions />} />;
}
