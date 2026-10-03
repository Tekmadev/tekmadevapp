import { ImageUp, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MESSAGES } from '@/api/errors';
import { Button } from '@/components/Button';
import { TextField } from '@/components/form/TextField';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';

import { isPreviewableUrl } from '../editor/form';
import { useDebouncedValue } from '../editor/hooks';
import { ImagePreview } from '../editor/ImagePreview';
import { ImageSourceSheet } from './ImageSourceSheet';
import type { ImageUpload } from './useImageUpload';

export type ImageUploadFieldProps = {
  /** What the image is, lower case ("cover image"): "Upload cover image", "Remove cover image". */
  noun: string;
  /** The image URL (the form value). */
  value: string;
  onChange: (url: string) => void;
  /** The upload slot, kept by a component that outlives this field (see useImageUpload). */
  upload: ImageUpload;
  /** The form's own error for the URL (an upload error takes its place while there is one). */
  error?: string | null;
  /** One line under the field. */
  hint?: string;
  /** What the preview shows, for TalkBack. */
  alt?: string;
  /** Width over height of the preview (1200 x 630 by default). */
  aspectRatio?: number;
};

/**
 * An image URL field that can also upload (brief update 2026-09-30): an Upload
 * button (gallery or camera) that shows the black hole and "Uploading" while
 * it works, a live preview with a remove (X) button once there is an image,
 * and the link field underneath, so pasting a link still works. Errors show
 * in signal red under the field. Upload is disabled offline.
 */
export function ImageUploadField({
  noun,
  value,
  onChange,
  upload,
  error,
  hint,
  alt = '',
  aspectRatio = 1200 / 630,
}: ImageUploadFieldProps) {
  const online = useIsOnline();
  const [choosing, setChoosing] = useState(false);
  const url = value.trim();
  const debounced = useDebouncedValue(url, 500);
  // A fresh upload shows at once; a typed link waits until typing pauses.
  const shown = !url ? '' : url === upload.lastUrl ? url : debounced;
  const label = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;

  return (
    <View style={styles.field}>
      {isPreviewableUrl(shown) ? (
        <View>
          <ImagePreview key={shown} url={shown} alt={alt || label} aspectRatio={aspectRatio} />
          <IconButton
            icon={X}
            variant="tonal"
            size={20}
            accessibilityLabel={`Remove ${noun}`}
            onPress={() => {
              upload.clearError();
              onChange('');
            }}
            style={styles.remove}
          />
        </View>
      ) : null}

      <View style={styles.upload}>
        <Button
          label="Upload"
          pendingLabel="Uploading"
          pending={upload.uploading}
          icon={ImageUp}
          variant="secondary"
          size="sm"
          disabled={!online}
          accessibilityLabel={`Upload ${noun}`}
          accessibilityHint={online ? 'Choose from the gallery or take a photo.' : MESSAGES.offline}
          onPress={() => setChoosing(true)}
        />
        {!online ? (
          <Text variant="small" color="ink3">
            {MESSAGES.offline}
          </Text>
        ) : null}
      </View>

      <TextField
        label={`${label} link`}
        value={value}
        onChangeText={(next) => {
          if (upload.error) upload.clearError();
          onChange(next);
        }}
        error={upload.error ?? error}
        help={hint ?? 'Or paste a full https:// link.'}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        clearable
      />

      <ImageSourceSheet visible={choosing} onClose={() => setChoosing(false)} onPick={upload.start} title={`Upload ${noun}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space[3] },
  remove: { position: 'absolute', top: space[1], right: space[1] },
  upload: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
