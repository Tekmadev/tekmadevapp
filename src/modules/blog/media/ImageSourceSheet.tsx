import { Camera, Images } from 'lucide-react-native';

import { MESSAGES } from '@/api/errors';
import { ActionSheet, type ActionSheetItem } from '@/components/sheet/ActionSheet';
import { useIsOnline } from '@/lib/connectivity';

import { PICK_COPY } from './errors';
import type { ImageSource } from './pick';

export type ImageSourceSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (source: ImageSource) => void;
  title?: string;
  /** More choices under the two sources (the body adds "Use an image link"). */
  extra?: ActionSheetItem[];
};

/**
 * Where the image comes from: the gallery (the system photo picker; Photos on
 * iPhone) or the camera. Both upload, so both are disabled offline with "You
 * are offline".
 */
export function ImageSourceSheet({ visible, onClose, onPick, title = 'Add an image', extra = [] }: ImageSourceSheetProps) {
  const online = useIsOnline();
  const offlineHint = online ? undefined : MESSAGES.offline;
  const items: ActionSheetItem[] = [
    { label: PICK_COPY.library, icon: Images, hint: offlineHint, disabled: !online, onPress: () => onPick('library') },
    { label: 'Take a photo', icon: Camera, hint: offlineHint, disabled: !online, onPress: () => onPick('camera') },
    ...extra,
  ];
  return <ActionSheet visible={visible} onClose={onClose} title={title} items={items} />;
}
