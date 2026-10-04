import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Share2, Sparkles } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authorsQuery, categoriesQuery } from '@/api/endpoints/blog';
import type { PostDetail } from '@/api/schemas/blog';
import { openInBrowser } from '@/components/automation/ApprovalBlocks';
import { Badge } from '@/components/Badge';
import { goBack } from '@/components/Header';
import { Menu } from '@/components/Menu';
import { OfflineBanner } from '@/components/OfflineBanner';
import type { ActionSheetItem } from '@/components/sheet/ActionSheet';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { metaQuery } from '@/modules/overview/hooks';

import { BLOG_COPY } from '../list/logic';
import { sharePostUrl } from '../list/usePostActions';
import { ArticlePreview, type PreviewAuthor } from './ArticlePreview';
import { EditorTopBar, useBadgeFitsBar, useTopBarInset } from './EditorTopBar';
import { formFromDetail, liveUrl } from './form';
import { useQuickReturn } from './hooks';
import { statusLabel } from './labels';

/** The compact title starts fading in once this much has scrolled (about the article's title line). */
const COLLAPSE_FROM = 40;
const COLLAPSE_SPAN = 48;

export type PostReaderProps = {
  /** The server copy (GET /blog/posts/:id). */
  detail: PostDetail;
  /** When the server copy was loaded, for the offline banner. */
  dataUpdatedAt: number;
  /** A background refetch is running (the top bar's hairline). */
  refetching: boolean;
};

/**
 * A post for someone who may read the blog but not write it (`blog.view`
 * without `blog.write`, staff by default): the Preview only, styled like the
 * public article. No fields, no Save, no toolbar and no Details editing; the
 * overflow keeps View live and Share link. The same top bar as the editor
 * (back, status, the title once it scrolls away) slides away while reading.
 */
export function PostReader({ detail, dataUpdatedAt, refetching }: PostReaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = useTopBarInset();
  const badgeInBar = useBadgeFitsBar();
  const meta = useQuery(metaQuery());
  const authors = useQuery(authorsQuery());
  const categories = useQuery(categoriesQuery());

  const post = detail.post;
  const form = formFromDetail(detail);
  const status = statusLabel(meta.data, post.status);
  const title = post.title.trim() || 'Untitled post';
  const live = post.status === 'published' ? liveUrl(post.slug) : null;
  const categoryName = categories.data?.find((c) => c.id === post.category?.id)?.name ?? post.category?.name ?? null;
  const author: PreviewAuthor = authors.data?.find((a) => a.id === post.author.id) ?? post.author;

  const hidden = useSharedValue(0);
  const hiddenTarget = useSharedValue(0);
  const scroll = useQuickReturn(hidden, hiddenTarget);
  // Only the shared value goes into the worklet (the scroll object also holds the handler).
  const y = scroll.y;
  const collapse = useDerivedValue(() => Math.min(1, Math.max(0, (y.get() - COLLAPSE_FROM) / COLLAPSE_SPAN)));

  const menuItems: ActionSheetItem[] = [
    ...(live
      ? [{ label: 'View live', icon: ExternalLink, hint: live.replace(/^https:\/\/www\./, ''), onPress: () => openInBrowser(live, colors) }]
      : []),
    {
      label: 'Share link',
      icon: Share2,
      disabled: !live,
      hint: live ? undefined : BLOG_COPY.shareNotLive,
      onPress: () => {
        if (live) sharePostUrl(live);
      },
    },
  ];

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <Animated.ScrollView
        onScroll={scroll.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: topInset + space[4], paddingBottom: insets.bottom + space[16] }]}
      >
        <OfflineBanner updatedAt={dataUpdatedAt} style={styles.banner} />
        {badgeInBar && post.source !== 'ai_draft' ? null : (
          <View style={styles.badges}>
            {badgeInBar ? null : <Badge label={status.label} tone={status.tone} />}
            {post.source === 'ai_draft' ? <Badge label="AI draft" tone="neutral" icon={Sparkles} /> : null}
          </View>
        )}
        <ArticlePreview
          form={form}
          author={author}
          categoryName={categoryName}
          publishedAt={post.publishedAt ?? null}
          isPublished={post.status === 'published'}
        />
      </Animated.ScrollView>

      <EditorTopBar
        hidden={hidden}
        collapse={collapse}
        title={title}
        status={badgeInBar ? status : null}
        previewing
        onBack={goBack}
        progress={refetching}
        menu={<Menu items={menuItems} title={title} accessibilityLabel="More actions" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: layout.gutter },
  banner: { marginBottom: space[4] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[4] },
});
