import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TextField } from '@/components/form/TextField';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/sheet/Sheet';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { isBareDomain, isValidDestination } from '@/lib/text';

import { isPreviewableUrl } from './form';
import { useDebouncedValue } from './hooks';
import { ImagePreview } from './ImagePreview';

/** A link the article can use: a site path, a web address or an email link. */
export function linkError(url: string): string | null {
  const text = url.trim();
  if (!text) return 'Enter a link.';
  if (isBareDomain(text)) return 'Add https:// for another website.';
  if (/^mailto:\S+@\S+$/i.test(text) || /^http:\/\/\S+\.\S+$/i.test(text) || isValidDestination(text)) return null;
  return 'Enter a full https:// link or a path like /start.';
}

export type LinkSheetProps = {
  /** The selected text, used as the link text. */
  initialText: string;
  onClose: () => void;
  onInsert: (label: string, url: string) => void;
};

/**
 * "Add a link": the text (the selected words, when there are some) and where it goes. Inserts
 * `[text](url)` at the selection. Mounted only while open, so it starts fresh.
 */
export function LinkSheet({ initialText, onClose, onInsert }: LinkSheetProps) {
  const [label, setLabel] = useState(initialText);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const insert = () => {
    const problem = linkError(url);
    if (problem) {
      setError(problem);
      haptics.error();
      return;
    }
    onInsert(label, url.trim());
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add a link"
      footer={<Button label="Add link" fullWidth onPress={insert} />}
    >
      <View style={styles.body}>
        <TextField label="Text" value={label} onChangeText={setLabel} help="What the reader sees. Leave blank to show the link." />
        <TextField
          label="Link"
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            if (error) setError(null);
          }}
          error={error}
          help="A full https:// link, or a path on the site like /start."
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={insert}
        />
      </View>
    </Sheet>
  );
}

export type ImageSheetProps = {
  onClose: () => void;
  onInsert: (url: string, alt: string, caption: string) => void;
};

/**
 * "Add an image": URL, alt text and caption, with a live preview. Inserts
 * `![alt](url "caption")` on its own line.
 */
export function ImageSheet({ onClose, onInsert }: ImageSheetProps) {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [errors, setErrors] = useState<{ url?: string; alt?: string }>({});
  const previewUrl = useDebouncedValue(url.trim(), 500);

  const insert = () => {
    const next: { url?: string; alt?: string } = {};
    if (!isPreviewableUrl(url)) next.url = 'Enter a full https:// image URL.';
    if (!alt.trim()) next.alt = 'Describe the image in a few words.';
    if (next.url || next.alt) {
      setErrors(next);
      haptics.error();
      return;
    }
    onInsert(url.trim(), alt, caption);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add an image"
      scrollable
      footer={<Button label="Add image" fullWidth onPress={insert} />}
    >
      <View style={styles.body}>
        <TextField
          label="Image URL"
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            if (errors.url) setErrors({ ...errors, url: undefined });
          }}
          error={errors.url}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {isPreviewableUrl(previewUrl) ? <ImagePreview key={previewUrl} url={previewUrl} alt={alt.trim()} /> : null}
        <TextField
          label="Alt text"
          value={alt}
          onChangeText={(v) => {
            setAlt(v);
            if (errors.alt) setErrors({ ...errors, alt: undefined });
          }}
          error={errors.alt}
          help="What the image shows, for screen readers and search."
        />
        <TextField label="Caption" value={caption} onChangeText={setCaption} help="Optional. Shown under the image." />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
