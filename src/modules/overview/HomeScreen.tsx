import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { TabHeaderActions } from '@/modules/shell/TabHeaderActions';

export function HomeScreen() {
  return <PlaceholderScreen title="Home" headerRight={<TabHeaderActions />} />;
}
