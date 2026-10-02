import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { createLink, linkKeys } from '@/api/endpoints/links';
import type { LinksMeta, ShortLink } from '@/api/schemas/links';
import { FilterChips } from '@/components/FilterChips';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { finalizeSlug, slugifyLive } from '@/lib/text';
import { withoutField } from '@/modules/clients/sections/formText';
import { showSaveError, useIntentKey } from '@/modules/clients/sections/sectionData';

import {
  destinationError,
  EMPTY_FORM,
  finalDestinationUrl,
  LINK_COPY,
  reservedSlugs,
  shareUrlOf,
  shortLinkText,
  SLUG_MAX,
  SLUG_PREFIX,
  slugError,
  toLinkCreate,
  upsertLink,
  utmSuggestions,
  validateNewLink,
  type NewLinkForm,
} from './logic';
import { shareLink } from './share';

export type NewLinkSheetProps = {
  onClose: () => void;
  /** GET /meta: reserved slugs and UTM suggestions (the brief's lists until it loads). */
  meta: LinksMeta | undefined;
  /** Slugs already taken, for an instant "already exists" (the server stays the judge). */
  existingSlugs: readonly string[];
};

type SuggestionsProps = {
  values: readonly string[];
  value: string;
  onPick: (value: string) => void;
  label: string;
};

/** Tap a suggestion to fill the field; tap it again to clear. */
function Suggestions({ values, value, onPick, label }: SuggestionsProps) {
  const current = value.trim();
  return (
    <FilterChips
      items={values.map((v) => ({ value: v, label: v }))}
      value={values.includes(current) ? current : null}
      allowDeselect
      onChange={(next) => onPick(next ?? '')}
      accessibilityLabel={label}
      style={styles.suggestions}
    />
  );
}

/**
 * New link (brief 8.11): the slug behind a fixed "tekmadev.com/" (lowercased
 * and dashed as you type, reserved and taken slugs refused inline), the
 * destination (a site path or a full https:// URL; a bare domain asks for
 * https://), the UTM source and medium with suggestions, the campaign, an
 * internal label, and a live preview of where visitors land. Links cannot be
 * edited afterwards, and the form says so. One Idempotency-Key per payload, so
 * a retry never creates a second link.
 */
export function NewLinkSheet({ onClose, meta, existingSlugs }: NewLinkSheetProps) {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { keyFor } = useIntentKey();
  const [form, setForm] = useState<NewLinkForm>(EMPTY_FORM);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  const [destinationLeft, setDestinationLeft] = useState(false);

  const reserved = reservedSlugs(meta);
  const { sources, mediums } = utmSuggestions(meta);

  const set = (field: keyof NewLinkForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setServerErrors((e) => withoutField(e, field));
  };

  const slug = finalizeSlug(form.slug);
  const slugShown =
    serverErrors.slug ?? (attempted && !slug ? LINK_COPY.slug : slugError(form.slug, reserved, existingSlugs));
  const destinationShown = serverErrors.destination ?? destinationError(form.destination, destinationLeft || attempted);
  const preview = finalDestinationUrl(form.destination, { source: form.utmSource, medium: form.utmMedium, campaign: form.utmCampaign });

  const submit = async () => {
    setAttempted(true);
    setDestinationLeft(true);
    if (Object.keys(validateNewLink(form, reserved, existingSlugs)).length > 0) {
      haptics.error();
      return;
    }
    const body = toLinkCreate(form);
    const link = await createLink(body, keyFor(body));
    queryClient.setQueryData<ShortLink[]>(linkKeys.list(), (old) => upsertLink(old, link));
    void queryClient.invalidateQueries({ queryKey: linkKeys.list() });
    haptics.success();
    const url = shareUrlOf(link);
    notice.ok(`Link created. Share ${url}`, { action: { label: 'Share', onPress: () => void shareLink(url) }, duration: 6000 });
    onClose();
  };

  const onError = (error: unknown) => showSaveError(error, setServerErrors);

  return (
    <Sheet
      visible
      onClose={onClose}
      title="New link"
      subtitle="A short link on tekmadev.com for QR codes, bios and cards."
      scrollable
      footer={<PendingButton label="Create link" pendingLabel="Creating" fullWidth onPress={submit} onError={onError} />}
    >
      <View style={styles.body}>
        <TextField
          label="Slug"
          prefix={SLUG_PREFIX}
          value={form.slug}
          onChangeText={(v) => set('slug', slugifyLive(v))}
          error={slugShown}
          help="Letters, numbers and dashes."
          monospace
          maxLength={SLUG_MAX}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <TextField
          label="Destination"
          value={form.destination}
          onChangeText={(v) => set('destination', v)}
          onBlur={() => setDestinationLeft(true)}
          error={destinationShown}
          help="A path like /start or a full https:// URL. Leave blank for the home page."
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <View style={styles.group}>
          <TextField
            label="UTM source"
            value={form.utmSource}
            onChangeText={(v) => set('utmSource', v)}
            error={serverErrors.utmSource}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          <Suggestions values={sources} value={form.utmSource} onPick={(v) => set('utmSource', v)} label="UTM source suggestions" />
        </View>
        <View style={styles.group}>
          <TextField
            label="UTM medium"
            value={form.utmMedium}
            onChangeText={(v) => set('utmMedium', v)}
            error={serverErrors.utmMedium}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          <Suggestions values={mediums} value={form.utmMedium} onPick={(v) => set('utmMedium', v)} label="UTM medium suggestions" />
        </View>
        <TextField
          label="UTM campaign"
          value={form.utmCampaign}
          onChangeText={(v) => set('utmCampaign', v)}
          error={serverErrors.utmCampaign}
          help="Like fall-sale or cards-2026."
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <TextField
          label="Internal label"
          value={form.label}
          onChangeText={(v) => set('label', v)}
          error={serverErrors.label}
          help="Only you see this."
          autoComplete="off"
        />

        <View
          style={[styles.preview, { backgroundColor: colors.bg2, borderColor: colors.line }]}
          accessible
          accessibilityLabel={`${slug ? shortLinkText(slug) : 'This link'} opens ${preview}`}
        >
          <Text variant="eyebrow">Preview</Text>
          <Text variant="mono" color="ink2" numberOfLines={2}>
            {slug ? shortLinkText(slug) : `${SLUG_PREFIX}...`}
          </Text>
          <Text variant="small" color="ink3">
            opens
          </Text>
          <Text variant="mono" selectable>
            {preview}
          </Text>
        </View>

        <Text variant="small" color="ink3">
          {LINK_COPY.noEdit}
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  group: { gap: space[2] },
  suggestions: { marginHorizontal: -layout.gutter },
  preview: { borderWidth: 1, borderRadius: radius.input, padding: space[4], gap: space[1] },
});
