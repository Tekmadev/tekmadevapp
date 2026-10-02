import { router } from 'expo-router';

import { ActionSheet, type ActionSheetItem } from '@/components/sheet/ActionSheet';

import { plusSheetActions, useVisibility } from '../registry';

export type PlusSheetProps = { visible: boolean; onClose: () => void };

/**
 * The gold + quick actions on Home and Customers (brief section 7): New client,
 * Log a booked call, and for owners Write a post, New coupon, New link.
 * Generated from the registry (`inPlusSheet` quick actions), filtered by role
 * and feature flags. Choosing one closes the sheet, then opens its screen.
 */
export function PlusSheet({ visible, onClose }: PlusSheetProps) {
  const visibility = useVisibility();
  const items: ActionSheetItem[] = plusSheetActions(visibility).map((action) => ({
    label: action.title,
    icon: action.icon,
    onPress: () => router.push(action.href),
  }));

  return <ActionSheet visible={visible} onClose={onClose} title="Quick actions" items={items} testID="plus-sheet" />;
}
