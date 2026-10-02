import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, WifiOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { renderQuery } from '@/api/endpoints/blog';
import { ApiError } from '@/api/errors';
import { MarkdownView } from '@/components/automation/ApprovalBlocks';
import { Avatar } from '@/components/Avatar';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { Skeleton, SkeletonGroup, useShowAfter } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { formatDate } from '@/lib/dates';
import { useIsOnline } from '@/lib/connectivity';

import { BlockView } from './BlockView';
import { faqList, isPreviewableUrl, takeawayList, type EditorForm } from './form';
import { useDebouncedValue } from './hooks';
import { ImagePreview } from './ImagePreview';

export type PreviewAuthor = { name: string; photoUrl: string | null; role: string | null };

export type ArticlePreviewProps = {
  form: EditorForm;
  author: PreviewAuthor;
  categoryName: string | null;
  /** The server's latest go-live time, shown when the post is live. */
  publishedAt: string | null;
  isPublished: boolean;
};

/** POST /blog/render runs once the body has been still this long. */
const RENDER_DEBOUNCE_MS = 400;

/**
 * Preview (brief 8.11): a native render of the post styled like the public
 * article. The body's blocks come from POST /blog/render; everything around
 * them (title, excerpt, author, takeaways, FAQs) comes from the form, so the
 * Preview shows unsaved edits too. Offline, the body is the Markdown lightly
 * formatted, and it says so.
 */
export function ArticlePreview({ form, author, categoryName, publishedAt, isPublished }: ArticlePreviewProps) {
  const { colors } = useTheme();
  const online = useIsOnline();
  const showSkeleton = useShowAfter();
  const markdown = useDebouncedValue(form.body, RENDER_DEBOUNCE_MS);
  const hasBody = markdown.trim().length > 0;
  const render = useQuery({ ...renderQuery(markdown), enabled: hasBody, placeholderData: keepPreviousData });

  const takeaways = takeawayList(form.keyTakeaways);
  const faqs = faqList(form.faqs).filter((f) => f.question && f.answer);
  const fresh = render.data && !render.isPlaceholderData ? render.data : null;
  const networkDown =
    !online || render.fetchStatus === 'paused' || (render.error instanceof ApiError && render.error.isNetwork);
  const minutes = (fresh ?? render.data)?.readingTimeMinutes ?? 0;

  let body;
  if (!form.body.trim()) {
    body = (
      <Text variant="body" color="ink4">
        The body is empty. Write something to see it here.
      </Text>
    );
  } else if (fresh) {
    body = fresh.blocks.map((block, i) => <BlockView key={i} block={block} />);
  } else if (networkDown) {
    body = (
      <>
        <View style={[styles.offline, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
          <Icon icon={WifiOff} size={16} color="ink3" />
          <Text variant="small" color="ink3" style={styles.flex}>
            Offline: a simple preview of your Markdown. The full one comes back with the connection.
          </Text>
        </View>
        <MarkdownView text={form.body} />
      </>
    );
  } else if (render.isError) {
    body = <ErrorState compact error={render.error} onRetry={() => render.refetch()} />;
  } else if (render.data) {
    // The previous render while the new one is on its way (a few hundred ms).
    body = render.data.blocks.map((block, i) => <BlockView key={i} block={block} />);
  } else {
    body = showSkeleton ? (
      <SkeletonGroup style={styles.skeleton}>
        <Skeleton width="92%" height={18} />
        <Skeleton width="100%" height={18} />
        <Skeleton width="80%" height={18} />
        <Skeleton width="96%" height={18} />
        <Skeleton width="60%" height={18} />
      </SkeletonGroup>
    ) : null;
  }

  const byline = [author.role, minutes > 0 && hasBody ? `${minutes} min read` : null, isPublished && publishedAt ? formatDate(publishedAt) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.article}>
      {isPreviewableUrl(form.coverImageUrl) ? (
        <ImagePreview key={form.coverImageUrl} url={form.coverImageUrl.trim()} alt={form.coverImageAlt.trim()} />
      ) : null}

      <View style={styles.head}>
        {categoryName ? <Text variant="eyebrow">{categoryName}</Text> : null}
        <Text variant="largeTitle" color={form.title.trim() ? 'ink' : 'ink4'} accessibilityRole="header">
          {form.title.trim() || 'Untitled post'}
        </Text>
        {form.excerpt.trim() ? (
          <Text variant="editor" color="ink3">
            {form.excerpt.trim()}
          </Text>
        ) : null}
      </View>

      <View style={[styles.author, { borderColor: colors.line }]}>
        <Avatar name={author.name} uri={author.photoUrl} size="md" />
        <View style={styles.flex}>
          <Text variant="bodyStrong">{author.name}</Text>
          {byline ? (
            <Text variant="small" color="ink3">
              {byline}
            </Text>
          ) : null}
        </View>
      </View>

      {takeaways.length > 0 ? (
        <View style={[styles.takeaways, { backgroundColor: colors.bg2, borderColor: colors.lineStrong }]}>
          <Text variant="eyebrow">Key takeaways</Text>
          {takeaways.map((t, i) => (
            <View key={i} style={styles.takeaway}>
              <View style={styles.check}>
                <Icon icon={Check} size={16} color="gold" strokeWidth={2.25} />
              </View>
              <Text variant="body" color="ink2" style={styles.flex}>
                {t}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.blocks}>{body}</View>

      {faqs.length > 0 ? (
        <View style={styles.faqs}>
          <Text variant="headline" accessibilityRole="header">
            Frequently asked questions
          </Text>
          {faqs.map((f, i) => (
            <View key={i} style={[styles.faq, i > 0 ? { borderTopColor: colors.line, borderTopWidth: 1 } : null]}>
              <Text variant="title" style={styles.faqQuestion}>
                {f.question}
              </Text>
              <Text variant="body" color="ink2">
                {f.answer}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  article: { gap: space[6] },
  head: { gap: space[3] },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  takeaways: { borderRadius: radius.card, borderWidth: 1, padding: space[4], gap: space[3] },
  takeaway: { flexDirection: 'row', gap: space[3] },
  check: { paddingTop: 3 },
  blocks: { gap: space[5] },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: space[3],
  },
  skeleton: { gap: space[3] },
  faqs: { gap: space[2] },
  faq: { gap: space[2], paddingVertical: space[4] },
  faqQuestion: { fontWeight: '700' },
});
