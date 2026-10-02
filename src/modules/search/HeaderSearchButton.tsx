import { Search } from 'lucide-react-native';

import { IconButton } from '@/components/IconButton';

import { searchSheet } from './searchStore';

/**
 * The search button in every tab header (via TabHeaderActions). Opens the one
 * global SearchSheet mounted in the signed-in layout. No required props.
 */
export function HeaderSearchButton() {
  return (
    <IconButton
      icon={Search}
      accessibilityLabel="Search"
      accessibilityHint="Searches screens, clients, leads and more"
      onPress={searchSheet.open}
    />
  );
}
