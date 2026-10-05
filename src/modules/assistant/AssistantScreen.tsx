import { Platform } from 'react-native';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function AssistantScreen() {
  // iPhone has no system back, and a deep link may open this with no history: it needs its own way out.
  return <PlaceholderScreen title="Assistant" back={Platform.OS === 'ios'} />;
}
