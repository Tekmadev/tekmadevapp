import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Archive, ExternalLink, EyeOff, Send, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newIdempotencyKey } from '@/api/client';
import {
  authorsQuery,
  blogKeys,
  categoriesQuery,
  createPost,
  publishPost,
  setPostStatus,
  trashPost,
  updatePost,
} from '@/api/endpoints/blog';
import { fieldErrors, MESSAGES } from '@/api/errors';
import type { Post, PostDetail, PostStatus, PostWrite } from '@/api/schemas/blog';
import { openInBrowser } from '@/components/automation/ApprovalBlocks';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { DraftRestoreNotice } from '@/components/form/DraftRestoreNotice';
import { FieldMessage } from '@/components/form/Field';
import { useAutosave, useDraftRestore } from '@/components/form/TextArea';
import { goBack } from '@/components/Header';
import { Menu } from '@/components/Menu';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PendingButton } from '@/components/PendingButton';
import type { ActionSheetItem } from '@/components/sheet/ActionSheet';
import { reportSubmitError, useSubmitGroup, useSubmitGroupHandle } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { durations, springs } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, space, withAlpha } from '@/design/tokens';
import { MAX_FONT_SCALE, type } from '@/design/typography';
import { useIsOnline } from '@/lib/connectivity';
import { countLabel } from '@/lib/format';
import { notice } from '@/lib/notice';
import { drafts } from '@/lib/storage';
import { metaQuery } from '@/modules/overview/hooks';

import { ArticlePreview, type PreviewAuthor } from './ArticlePreview';
import { DetailsSheet } from './DetailsSheet';
import type { SetField } from './DetailsTabs';
import { EditorTopBar, useBadgeFitsBar, useTopBarInset } from './EditorTopBar';
import {
  buildCreate,
  buildPatch,
  EMPTY_BODY,
  emptyForm,
  firstErrorTab,
  formFromDetail,
  formsEqual,
  FOUNDER_NAME,
  hasChanges,
  liveUrl,
  normalizeDraft,
  validateForm,
  wordCount,
  type DetailsTab,
  type EditorForm,
  type FormErrors,
} from './form';
import { FormatToolbar, TOOLBAR_HEIGHT, type ToolbarAction } from './FormatToolbar';
import { useQuickReturn } from './hooks';
import { ImageSheet, LinkSheet } from './InsertSheets';
import { statusLabel } from './labels';
import { LeaveSheet } from './LeaveSheet';
import {
  insertAnswer,
  insertCallout,
  insertCta,
  insertDivider,
  insertImage,
  insertLink,
  insertTable,
  selectedText,
  toggleInline,
  toggleLinePrefix,
  type Edit,
  type Selection,
} from './toolbar';

/** The server copy the form started from: what "unsaved" is measured against. */
type Base = { form: EditorForm; updatedAt: string | null; post: Post | null };

type PreventRemoveCallback = Parameters<typeof usePreventRemove>[1];
type NavAction = Parameters<PreventRemoveCallback>[0]['data']['action'];

const TOAST_SAVED = 'Saved. A version snapshot was recorded.';
const TOAST_CREATED = 'Post created. Keep editing, then publish when ready.';
const TOAST_PUBLISHED = 'Published and live on the site.';

/** Local key for the post's autosaved draft ("blog.new" until it exists). */
export const draftKeyFor = (postId: string | null) => `blog.${postId ?? 'new'}`;

const withoutKey = (errors: FormErrors, key: string): FormErrors => {
  const next = { ...errors };
  delete next[key];
  return next;
};

/** A PATCH body without its status (publishing sets that itself). */
function changesOnly(patch: PostWrite): PostWrite {
  const rest = { ...patch };
  delete rest.status;
  return rest;
}

export type PostEditorProps = {
  /** Null for a new post ("Create post"). */
  postId: string | null;
  /** The server copy (GET /blog/posts/:id); null for a new post. */
  detail: PostDetail | null;
  /** When the server copy was loaded, for the offline banner. */
  dataUpdatedAt: number;
  /** A background refetch is running (the top bar's hairline). */
  refetching: boolean;
};

/**
 * The blog post editor (brief 8.11): the most important writing surface in
 * the app. A large title, then the Markdown body in a calm 17/28 writing
 * field with the formatting toolbar above the keyboard. The top bar carries
 * the status, Preview, Save and the overflow (Publish or Unpublish, Archive,
 * View live, Move to trash) and slides away while writing.
 *
 * Every keystroke is kept on the phone every 3 seconds; leaving with unsaved
 * changes asks first; a newer local draft is offered back on open. Saves send
 * only what changed and adopt the post the server returns.
 */
export function PostEditor({ postId, detail, dataUpdatedAt, refetching }: PostEditorProps) {
  const isNew = postId === null;
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = useTopBarInset();
  const badgeInBar = useBadgeFitsBar();
  const online = useIsOnline();
  const meta = useQuery(metaQuery());
  const authors = useQuery(authorsQuery());
  const categories = useQuery(categoriesQuery());
  const group = useSubmitGroupHandle();
  const { pendingId } = useSubmitGroup(group);

  const draftKey = draftKeyFor(postId);
  const autosave = useAutosave<EditorForm>(draftKey);

  const [initial] = useState(() => (detail ? formFromDetail(detail) : emptyForm()));
  const [base, setBase] = useState<Base>({ form: initial, updatedAt: detail?.updatedAt ?? null, post: detail?.post ?? null });
  const [form, setForm] = useState<EditorForm>(initial);
  const [seen, setSeen] = useState<string | null>(detail?.updatedAt ?? null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [intent, setIntent] = useState<{ signature: string; key: string } | null>(null);

  const [previewing, setPreviewing] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const [forcedSelection, setForcedSelection] = useState<Selection | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>('basics');
  const [publishOpen, setPublishOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<NavAction | null>(null);
  const [linkSheet, setLinkSheet] = useState<{ selection: Selection; text: string } | null>(null);
  const [imageSheet, setImageSheet] = useState<{ selection: Selection } | null>(null);

  const bodyRef = useRef<TextInput>(null);
  const selectionRef = useRef<Selection>({ start: 0, end: 0 });
  /** The newest form, for handlers that run after an await or twice in one tick. */
  const formRef = useRef(form);
  /** Set once leaving is decided (saved, discarded, created, trashed): the guard lets it through. */
  const leavingRef = useRef(false);
  useEffect(() => {
    formRef.current = form;
  });

  const dirty = hasChanges(base.form, form, isNew);

  // A newer server copy (refetch on focus or resume): take it when nothing here is unsaved.
  if (detail && detail.updatedAt !== seen) {
    setSeen(detail.updatedAt);
    if (!dirty) {
      const next = formFromDetail(detail, form);
      setBase({ form: next, updatedAt: detail.updatedAt, post: detail.post });
      setForm(next);
    }
  }

  const serverPost = detail?.post ?? base.post;
  const serverStatus: PostStatus = serverPost?.status ?? 'draft';
  const status = statusLabel(meta.data, serverStatus);

  // "Restore your unsaved changes?" when the phone holds a newer copy than the server.
  const draftEqual = (a: EditorForm, b: EditorForm) => {
    const draft = normalizeDraft(a, base.form);
    return draft ? formsEqual(draft, b) : true;
  };
  const offer = useDraftRestore<EditorForm>(draftKey, base.form, base.updatedAt, draftEqual);

  /* ---------- editing ---------- */

  const update = (next: EditorForm) => {
    formRef.current = next;
    setForm(next);
    autosave.schedule(next);
  };

  const setField: SetField = (key, value) => {
    update({ ...formRef.current, [key]: value });
    if (errors[key]) setErrors(withoutKey(errors, key));
  };

  const applyEdit = (edit: Edit) => {
    update({ ...formRef.current, body: edit.text });
    selectionRef.current = edit.selection;
    setForcedSelection(edit.selection);
    bodyRef.current?.focus();
  };

  const onToolbar = (action: ToolbarAction) => {
    const text = formRef.current.body;
    const sel = selectionRef.current;
    switch (action) {
      case 'h2':
      case 'h3':
      case 'bullet':
      case 'numbered':
      case 'quote':
        applyEdit(toggleLinePrefix(text, sel, action));
        break;
      case 'bold':
      case 'italic':
        applyEdit(toggleInline(text, sel, action));
        break;
      case 'answer':
        applyEdit(insertAnswer(text, sel));
        break;
      case 'table':
        applyEdit(insertTable(text, sel));
        break;
      case 'cta':
        applyEdit(insertCta(text, sel));
        break;
      case 'divider':
        applyEdit(insertDivider(text, sel));
        break;
      case 'link':
        setLinkSheet({ selection: sel, text: selectedText(text, sel) });
        break;
      case 'image':
        setImageSheet({ selection: sel });
        break;
    }
  };

  /* ---------- top bar ---------- */

  const hidden = useSharedValue(0);
  const hiddenTarget = useSharedValue(0);
  const titleHeight = useSharedValue(0);
  const previewingSV = useSharedValue(false);
  const editScroll = useQuickReturn(hidden, hiddenTarget);
  const previewScroll = useQuickReturn(hidden, hiddenTarget);
  const collapse = useDerivedValue(() => {
    const y = previewingSV.get() ? previewScroll.y.get() : editScroll.y.get();
    const h = Math.max(titleHeight.get(), 48);
    return Math.min(1, Math.max(0, (y - h * 0.5) / (h * 0.5)));
  });

  const showBar = () => {
    hiddenTarget.set(0);
    hidden.set(withSpring(0, springs.snappy));
  };

  const togglePreview = () => {
    if (!previewing) Keyboard.dismiss();
    previewingSV.set(!previewing);
    setPreviewing(!previewing);
    showBar();
  };

  const openDetails = (tab?: DetailsTab) => {
    Keyboard.dismiss();
    if (tab) setDetailsTab(tab);
    setDetailsOpen(true);
  };

  /* ---------- errors ---------- */

  /**
   * Inline errors; a Details field opens the sheet on its tab. A local check on
   * the title (which may be scrolled away) also says it in a toast; the server's
   * own message is toasted by the caller.
   */
  const showErrors = (next: FormErrors, toast: boolean) => {
    setErrors(next);
    haptics.error();
    const tab = firstErrorTab(next);
    if (tab) {
      openDetails(tab);
      return;
    }
    const first = Object.values(next).find(Boolean);
    if (toast && first) notice.err(first);
    showBar();
  };

  /** A failed save or publish: the server's field errors inline, its message as a toast. */
  const onSaveError = (error: unknown) => {
    const fields = fieldErrors(error);
    const keys = Object.keys(fields);
    if (keys.length > 0) {
      const mapped: FormErrors = {};
      for (const k of keys) mapped[k === 'bodyMarkdown' ? 'body' : k] = fields[k];
      setLeaveOpen(false);
      showErrors(mapped, false);
    }
    reportSubmitError(error);
  };

  /* ---------- server results ---------- */

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
    // Category counts move when a post changes category or goes to the trash.
    void queryClient.invalidateQueries({ queryKey: blogKeys.categories() });
  };

  /** Take the post a save returned. Anything typed while it saved stays, unsaved. */
  const adopt = (result: PostDetail, sent: EditorForm) => {
    const current = formRef.current;
    const next = formFromDetail(result, current);
    setBase({ form: next, updatedAt: result.updatedAt, post: result.post });
    setSeen(result.updatedAt);
    if (formsEqual(current, sent)) {
      formRef.current = next;
      setForm(next);
      autosave.clear();
    } else {
      const kept = { ...current, status: result.post.status };
      formRef.current = kept;
      setForm(kept);
    }
    setErrors({});
    queryClient.setQueryData(blogKeys.post(result.post.id), result);
    refreshLists();
  };

  /** Leave once leaving is settled: the action the guard stopped, or back. */
  const leave = () => {
    leavingRef.current = true;
    setLeaveOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (action) navigation.dispatch(action);
    else goBack();
  };

  /** A new post exists: open it in place of "new" (or finish leaving). */
  const afterCreate = (result: PostDetail, sent: EditorForm, message: string, mode: 'stay' | 'leave') => {
    const id = result.post.id;
    queryClient.setQueryData(blogKeys.post(id), result);
    refreshLists();
    const current = formRef.current;
    autosave.clear();
    // Typed while it was being created: that becomes the new post's local draft, offered on open.
    if (!formsEqual(current, sent)) drafts.set(draftKeyFor(id), current);
    haptics.success();
    notice.ok(message);
    if (mode === 'leave') {
      leave();
      return;
    }
    leavingRef.current = true;
    router.replace({ pathname: '/blog/[id]', params: { id } });
  };

  /** One Idempotency-Key per intent: the same body retried reuses it. */
  const intentKey = (input: PostWrite) => {
    const signature = JSON.stringify(input);
    const key = intent?.signature === signature ? intent.key : newIdempotencyKey();
    if (key !== intent?.key) setIntent({ signature, key });
    return key;
  };

  /* ---------- actions ---------- */

  const save = async (mode: 'stay' | 'leave') => {
    const sent = formRef.current;
    const local = validateForm(sent);
    if (Object.keys(local).length > 0) {
      setLeaveOpen(false);
      showErrors(local, true);
      return;
    }
    // Choosing Published in Details goes through the publish hold.
    if (sent.status === 'published' && serverStatus !== 'published') {
      setLeaveOpen(false);
      setPendingAction(null);
      startPublish();
      return;
    }
    if (!postId) {
      const input = buildCreate(sent);
      const result = await createPost(input, intentKey(input));
      afterCreate(result, sent, TOAST_CREATED, mode);
      return;
    }
    const patch = buildPatch(base.form, sent);
    if (Object.keys(patch).length > 0) {
      const result = await updatePost(postId, patch);
      adopt(result, sent);
      haptics.success();
      notice.ok(TOAST_SAVED);
    }
    if (mode === 'leave') leave();
  };

  const startPublish = () => {
    const current = formRef.current;
    const local = validateForm(current);
    if (Object.keys(local).length > 0) {
      showErrors(local, true);
      return;
    }
    if (!current.body.trim()) {
      haptics.error();
      notice.err(EMPTY_BODY);
      return;
    }
    Keyboard.dismiss();
    setPublishOpen(true);
  };

  const publish = async () => {
    const sent = formRef.current;
    if (!postId) {
      const input: PostWrite & { title: string } = { ...buildCreate(sent), status: 'published' };
      const result = await createPost(input, intentKey(input));
      afterCreate(result, sent, TOAST_PUBLISHED, 'stay');
      return;
    }
    // Unsaved changes go live with it, in one request.
    const changes = changesOnly(buildPatch(base.form, sent));
    const result =
      Object.keys(changes).length > 0 ? await updatePost(postId, { ...changes, status: 'published' }) : await publishPost(postId);
    adopt(result, sent);
    haptics.success();
    notice.ok(TOAST_PUBLISHED);
  };

  const changeStatus = (next: PostStatus) => {
    if (!postId) return;
    const task = group.run('status', async () => {
      const result = await setPostStatus(postId, next);
      const kept = { ...formRef.current, status: result.post.status };
      setBase({ form: { ...base.form, status: result.post.status }, updatedAt: result.updatedAt, post: result.post });
      setSeen(result.updatedAt);
      formRef.current = kept;
      setForm(kept);
      queryClient.setQueryData(blogKeys.post(postId), result);
      void queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
      haptics.success();
      notice.ok(next === 'archived' ? 'Archived. It is off the site.' : 'Unpublished. It is a draft now.');
    });
    task?.catch((error: unknown) => reportSubmitError(error));
  };

  const trash = async () => {
    if (!postId) return;
    await trashPost(postId);
    autosave.clear();
    refreshLists();
    notice.ok('Moved to trash.');
    leavingRef.current = true;
    goBack();
  };

  const discard = () => {
    autosave.clear();
    leave();
  };

  /* ---------- unsaved-changes guard ---------- */

  // Hardware back, the header back and the back gesture all remove the screen: ask first.
  usePreventRemove(dirty, ({ data }) => {
    if (leavingRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Keyboard.dismiss();
    setPendingAction(data.action);
    setLeaveOpen(true);
  });

  /* ---------- derived display ---------- */

  const categoryName =
    categories.data?.find((c) => c.id === form.categoryId)?.name ??
    (serverPost?.category && serverPost.category.id === form.categoryId ? serverPost.category.name : null);
  const authorId = form.authorId ?? serverPost?.author.id ?? null;
  const author: PreviewAuthor = authors.data?.find((a) => a.id === authorId) ??
    (serverPost && serverPost.author.id === authorId ? serverPost.author : null) ??
    authors.data?.[0] ?? { name: FOUNDER_NAME, photoUrl: null, role: null };
  const words = wordCount(form.body);
  const saveLabel = isNew ? 'Create post' : 'Save changes';
  const savePendingLabel = isNew ? 'Creating' : 'Saving';

  const offlineHint = online ? undefined : MESSAGES.offline;
  const live = !isNew && serverStatus === 'published' && serverPost ? liveUrl(serverPost.slug) : null;
  // Built as one literal: the actions read the latest form from a ref, so they are never called while rendering.
  const menuItems: ActionSheetItem[] = [
    { label: 'Details', icon: SlidersHorizontal, onPress: () => openDetails() },
    serverStatus === 'published' && !isNew
      ? {
          label: 'Unpublish',
          icon: EyeOff,
          hint: offlineHint ?? 'Takes it off the site. It becomes a draft.',
          disabled: !online,
          onPress: () => changeStatus('draft'),
        }
      : { label: 'Publish', icon: Send, hint: offlineHint, disabled: !online, onPress: () => startPublish() },
    ...(!isNew && serverStatus !== 'archived'
      ? [{ label: 'Archive', icon: Archive, hint: offlineHint, disabled: !online, onPress: () => changeStatus('archived') }]
      : []),
    ...(live
      ? [{ label: 'View live', icon: ExternalLink, hint: live.replace(/^https:\/\/www\./, ''), onPress: () => openInBrowser(live, colors) }]
      : []),
    ...(!isNew
      ? [{ label: 'Move to trash', icon: Trash2, destructive: true, hint: offlineHint, disabled: !online, onPress: () => setTrashOpen(true) }]
      : []),
  ];

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      {/* Under the Preview, the editor is hidden from TalkBack and VoiceOver. */}
      <View
        style={styles.fill}
        importantForAccessibility={previewing ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={previewing}
      >
        <KeyboardAwareScrollView
          onScroll={editScroll.onScroll}
          scrollEventThrottle={16}
          bottomOffset={space[6]}
          extraKeyboardSpace={bodyFocused ? TOOLBAR_HEIGHT : 0}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingTop: topInset + space[2], paddingBottom: (bodyFocused ? 0 : insets.bottom) + space[16] },
          ]}
        >
          {!isNew ? <OfflineBanner updatedAt={dataUpdatedAt} style={styles.banner} /> : null}
          <DraftRestoreNotice
            draft={offer.draft}
            onRestore={() => {
              const restored = normalizeDraft(offer.restore(), base.form);
              if (restored) update(restored);
            }}
            onDiscard={offer.discard}
            style={styles.banner}
          />

          <View
            onLayout={(e) => {
              titleHeight.set(e.nativeEvent.layout.height);
            }}
          >
            <TextInput
              value={form.title}
              onChangeText={(t) => setField('title', t.replace(/\s*\n+\s*/g, ' '))}
              placeholder="Title"
              placeholderTextColor={colors.ink4}
              multiline
              submitBehavior="submit"
              returnKeyType="next"
              onSubmitEditing={() => bodyRef.current?.focus()}
              autoCapitalize="sentences"
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              selectionColor={withAlpha(colors.gold, 0.3)}
              selectionHandleColor={colors.gold}
              cursorColor={colors.gold}
              accessibilityLabel="Title"
              style={[type.largeTitle, styles.title, { color: colors.ink }]}
            />
            {errors.title ? <FieldMessage error={errors.title} inset="none" /> : null}
          </View>

          <View style={styles.metaRow}>
            <Button label="Details" icon={SlidersHorizontal} variant="secondary" size="sm" onPress={() => openDetails()} />
            {badgeInBar ? null : <Badge label={status.label} tone={status.tone} style={styles.metaBadge} />}
            {serverPost?.source === 'ai_draft' ? <Badge label="AI draft" tone="neutral" icon={Sparkles} style={styles.metaBadge} /> : null}
            <Text variant="small" color="ink3" numberOfLines={1} style={styles.flex}>
              {[categoryName ?? 'No category', countLabel(words, 'word', 'words')].join(' · ')}
            </Text>
          </View>
          {!online ? (
            <Text variant="small" color="ink3" style={styles.offlineNote}>
              Saving needs a connection. Your writing is kept on this phone.
            </Text>
          ) : null}

          <TextInput
            ref={bodyRef}
            value={form.body}
            onChangeText={(body) => setField('body', body)}
            onSelectionChange={(e) => {
              selectionRef.current = e.nativeEvent.selection;
              if (forcedSelection) setForcedSelection(null);
            }}
            selection={forcedSelection ?? undefined}
            onFocus={() => setBodyFocused(true)}
            onBlur={() => {
              setBodyFocused(false);
              autosave.flush();
            }}
            placeholder="Start writing. Markdown works here: ## for a heading, **bold**, - for a list."
            placeholderTextColor={colors.ink4}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            autoCapitalize="sentences"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            selectionColor={withAlpha(colors.gold, 0.3)}
            selectionHandleColor={colors.gold}
            cursorColor={colors.gold}
            accessibilityLabel="Post body, Markdown"
            style={[type.editor, styles.body, { color: colors.ink }]}
          />
        </KeyboardAwareScrollView>

        {bodyFocused && !previewing ? (
          <KeyboardStickyView offset={{ opened: insets.bottom }}>
            <View style={{ paddingBottom: insets.bottom, backgroundColor: colors.bg2 }}>
              <FormatToolbar
                onAction={onToolbar}
                onCallout={(variant) => applyEdit(insertCallout(formRef.current.body, selectionRef.current, variant))}
                onHideKeyboard={() => Keyboard.dismiss()}
              />
            </View>
          </KeyboardStickyView>
        ) : null}
      </View>

      {previewing ? (
        <Animated.View entering={FadeIn.duration(durations.base)} style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
          <Animated.ScrollView
            onScroll={previewScroll.onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingTop: topInset + space[4], paddingBottom: insets.bottom + space[16] }]}
          >
            <ArticlePreview
              form={form}
              author={author}
              categoryName={categoryName}
              publishedAt={serverPost?.publishedAt ?? null}
              isPublished={serverStatus === 'published'}
            />
          </Animated.ScrollView>
        </Animated.View>
      ) : null}

      <EditorTopBar
        hidden={hidden}
        collapse={collapse}
        title={form.title.trim() || 'Untitled post'}
        status={badgeInBar ? status : null}
        previewing={previewing}
        onTogglePreview={togglePreview}
        onBack={goBack}
        progress={refetching || pendingId === 'status'}
        save={
          <PendingButton
            label={saveLabel}
            pendingLabel={savePendingLabel}
            size="sm"
            group={group}
            disabled={!dirty}
            offlineHint={false}
            onPress={() => save('stay')}
            onError={onSaveError}
          />
        }
        menu={<Menu items={menuItems} title={form.title.trim() || 'Untitled post'} accessibilityLabel="More actions" />}
      />

      <DetailsSheet
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        tab={detailsTab}
        onTabChange={setDetailsTab}
        form={form}
        onChange={setField}
        errors={errors}
        saved={serverPost}
        meta={meta.data}
        authors={authors.data}
        categories={categories.data}
        saveLabel={saveLabel}
        savePendingLabel={savePendingLabel}
        canSave={dirty}
        onSave={() => save('stay')}
        onSaveError={onSaveError}
      />

      <ConfirmSheet
        visible={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish this post to tekmadev.com?"
        message={
          dirty
            ? 'Your unsaved changes are saved with it, and the post goes live on the blog right away.'
            : 'The post goes live on the blog right away.'
        }
        confirmLabel="Hold to publish"
        pendingLabel="Publishing"
        tone="ink"
        onConfirm={publish}
        onError={onSaveError}
      />

      <ConfirmSheet
        visible={trashOpen}
        onClose={() => setTrashOpen(false)}
        title="Move to trash?"
        message={`Move "${form.title.trim() || 'Untitled post'}" to trash. It comes off the blog, and its link stays reserved.`}
        confirmLabel="Hold to move to trash"
        pendingLabel="Moving to trash"
        onConfirm={trash}
      />

      <LeaveSheet
        visible={leaveOpen}
        onClose={() => {
          setLeaveOpen(false);
          setPendingAction(null);
        }}
        onSave={() => save('leave')}
        onSaveError={onSaveError}
        onDiscard={discard}
      />

      {linkSheet ? (
        <LinkSheet
          initialText={linkSheet.text}
          onClose={() => setLinkSheet(null)}
          onInsert={(label, url) => {
            const at = linkSheet.selection;
            setLinkSheet(null);
            applyEdit(insertLink(formRef.current.body, at, label, url));
          }}
        />
      ) : null}
      {imageSheet ? (
        <ImageSheet
          onClose={() => setImageSheet(null)}
          onInsert={(url, alt, caption) => {
            const at = imageSheet.selection;
            setImageSheet(null);
            applyEdit(insertImage(formRef.current.body, at, url, alt, caption));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.gutter },
  banner: { marginBottom: space[4] },
  title: { padding: 0, margin: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[3] },
  metaBadge: { alignSelf: 'center' },
  offlineNote: { marginTop: space[2] },
  body: { minHeight: 320, marginTop: space[6], padding: 0 },
});
