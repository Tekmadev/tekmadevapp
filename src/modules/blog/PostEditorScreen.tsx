import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { blogKeys, postQuery } from '@/api/endpoints/blog';
import { ApiError, MESSAGES } from '@/api/errors';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { ErrorState } from '@/components/ErrorState';
import { Screen } from '@/components/Screen';
import { useShowAfter } from '@/components/Skeleton';
import { useIsOnline } from '@/lib/connectivity';
import { oneParam } from '@/modules/clients/detail/logic';
import { useRefetchOnFocus } from '@/modules/overview/hooks';

import { EditorSkeleton } from './editor/EditorSkeleton';
import { PostEditor } from './editor/PostEditor';

/**
 * The post editor route (`/blog/[id]`, brief 8.11). `id=new` writes a new post;
 * another id loads it (the cached copy shows at once) and refetches when the
 * screen regains focus or the app comes back. Owner only.
 */
export function PostEditorScreen() {
  return (
    <OwnerOnly>
      <PostEditorRoute />
    </OwnerOnly>
  );
}

function PostEditorRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = oneParam(params.id) ?? '';
  const isNew = id === 'new';
  const online = useIsOnline();
  const showSkeleton = useShowAfter();

  const query = useQuery({ ...postQuery(id), enabled: !isNew && id !== '' });
  useRefetchOnFocus((options) => (!isNew && id ? query.refetch(options) : undefined), query.dataUpdatedAt);

  if (isNew) return <PostEditor key="new" postId={null} detail={null} dataUpdatedAt={0} refetching={false} />;

  // A 404 means the post is gone (trashed elsewhere): say so instead of editing a cached copy.
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (query.data && !notFound) {
    return (
      <PostEditor
        key={id}
        postId={id}
        detail={query.data}
        dataUpdatedAt={query.dataUpdatedAt}
        refetching={query.isFetching && !query.isPending}
      />
    );
  }

  let body;
  if (!id || notFound) {
    body = <ErrorState message="That post no longer exists." />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: say so instead of a skeleton that never ends. It loads by itself once back online.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = showSkeleton ? <EditorSkeleton /> : null;
  }

  return (
    <Screen back largeTitle={false} queryKey={blogKeys.post(id)}>
      {body}
    </Screen>
  );
}
