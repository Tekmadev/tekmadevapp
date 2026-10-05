import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, ImageOff } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { StyleSheet, View, type TextStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text, type TextColor } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme, type Theme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import type { TypeVariant } from '@/design/typography';
import { notice } from '@/lib/notice';

import { diffWords, type DiffSpan } from './diff';
import { isSafeHref, parseMarkdown, type InlineSpan, type MdBlock } from './markdown';
import type { ApprovalBlock, ApprovalKeyValueRow } from './types';

/** Opens a link in a Custom Tab tinted like the app. */
export function openInBrowser(url: string, colors: Theme['colors']) {
  if (!isSafeHref(url)) return;
  WebBrowser.openBrowserAsync(url, {
    toolbarColor: colors.bg,
    secondaryToolbarColor: colors.bg,
    showTitle: true,
    enableBarCollapsing: true,
  }).catch(() => notice.err('Could not open that link.'));
}

/** Host and path for display ("tekmadev.com/start"), without the scheme. */
function displayUrl(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}

/** One preview block. Unknown block types (a newer server) render nothing rather than crash. */
export function ApprovalBlockView({ block }: { block: ApprovalBlock }) {
  switch (block.type) {
    case 'markdown':
      return <MarkdownView text={block.text} />;
    case 'keyValue':
      return <KeyValueView rows={block.rows} />;
    case 'image':
      return <ImageView url={block.url} alt={block.alt} caption={block.caption} />;
    case 'link':
      return <LinkView label={block.label} url={block.url} />;
    case 'diff':
      return <DiffView before={block.before} after={block.after} label={block.label} />;
    default:
      return null;
  }
}

/* ---------- markdown ---------- */

type SpansProps = { spans: InlineSpan[]; variant: TypeVariant; color: TextColor };

/**
 * Inline spans as nested Text. Each nested Text repeats the parent's variant
 * and colour because our Text applies a full type style. Links are the one
 * tap target inside running text, so they use Text onPress (a PressableScale
 * cannot sit inside a line of text); they still get the press haptic.
 */
function Spans({ spans, variant, color }: SpansProps) {
  const { colors } = useTheme();
  return (
    <>
      {spans.map((s, i) => {
        // Bold and code go through the face props: iOS needs a font file per weight and family.
        const weight = s.bold ? '700' : undefined;
        const family = s.code ? 'mono' : undefined;
        const style: TextStyle[] = [];
        if (s.italic) style.push(styles.italic);
        if (s.code) style.push({ backgroundColor: colors.bg3 });
        if (isSafeHref(s.href)) {
          const href = s.href;
          return (
            <Text
              key={i}
              variant={variant}
              weight={weight}
              family={family}
              tone="gold"
              accessibilityRole="link"
              style={[...style, styles.linkText]}
              onPress={() => {
                haptics.light();
                openInBrowser(href, colors);
              }}
            >
              {s.text}
            </Text>
          );
        }
        return (
          <Text key={i} variant={variant} color={color} weight={weight} family={family} style={style}>
            {s.text}
          </Text>
        );
      })}
    </>
  );
}

function MdBlockView({ block }: { block: MdBlock }) {
  const { colors } = useTheme();
  switch (block.kind) {
    case 'heading': {
      const variant: TypeVariant = block.level <= 2 ? 'title' : 'bodyStrong';
      return (
        <Text variant={variant} accessibilityRole="header">
          <Spans spans={block.spans} variant={variant} color="ink" />
        </Text>
      );
    }
    case 'paragraph':
      return (
        <Text variant="body" color="ink2">
          <Spans spans={block.spans} variant="body" color="ink2" />
        </Text>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text variant="body" color="ink3" tabular style={styles.marker}>
                {block.ordered ? `${block.start + i}.` : '•'}
              </Text>
              <Text variant="body" color="ink2" style={styles.flex}>
                <Spans spans={item} variant="body" color="ink2" />
              </Text>
            </View>
          ))}
        </View>
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: colors.goldSoft }]}>
          <Text variant="body" color="ink3">
            <Spans spans={block.spans} variant="body" color="ink3" />
          </Text>
        </View>
      );
    case 'code':
      return (
        <View style={[styles.codeBlock, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
          <Text variant="mono" color="ink2">
            {block.text}
          </Text>
        </View>
      );
    case 'divider':
      return <View style={[styles.divider, { backgroundColor: colors.line }]} />;
  }
}

export function MarkdownView({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View style={styles.markdown}>
      {blocks.map((b, i) => (
        <MdBlockView key={i} block={b} />
      ))}
    </View>
  );
}

/* ---------- key / value ---------- */

function KeyValueView({ rows }: { rows: ApprovalKeyValueRow[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.kv, { borderColor: colors.line }]}>
      {rows.map((row, i) => (
        <View
          key={`${row.label}-${i}`}
          accessible
          accessibilityLabel={`${row.label}: ${row.value}`}
          style={[styles.kvRow, i > 0 ? { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth } : null]}
        >
          <Text variant="small" color="ink3" style={styles.kvLabel}>
            {row.label}
          </Text>
          <Text variant="label" tabular align="right" style={styles.kvValue}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- image ---------- */

function ImageView({ url, alt, caption }: { url: string; alt: string; caption?: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.imageBlock}>
      <View style={[styles.imageFrame, { backgroundColor: colors.bg3, borderColor: colors.line }]}>
        {failed ? (
          <View style={styles.imageFallback} accessible accessibilityLabel={`Image could not load. ${alt}`}>
            <Icon icon={ImageOff} size={22} color="ink4" />
            <Text variant="small" color="ink3" align="center" numberOfLines={3}>
              {alt}
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: url }}
            accessibilityLabel={alt}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            style={StyleSheet.absoluteFill}
            onError={() => setFailed(true)}
          />
        )}
      </View>
      {caption ? (
        <Text variant="small" color="ink3">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- link ---------- */

function LinkView({ label, url }: { label: string; url: string }) {
  const { colors } = useTheme();
  const safe = isSafeHref(url);
  return (
    <PressableScale
      disabled={!safe}
      onPress={() => openInBrowser(url, colors)}
      accessibilityRole="link"
      accessibilityLabel={`${label}, opens ${displayUrl(url)}`}
      style={[styles.linkBox, { borderColor: colors.line, backgroundColor: colors.bg2 }]}
    >
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {label}
        </Text>
        <Text variant="mono" color="ink4" numberOfLines={1} ellipsizeMode="middle">
          {displayUrl(url)}
        </Text>
      </View>
      <Icon icon={ExternalLink} size={18} color="ink3" />
    </PressableScale>
  );
}

/* ---------- diff ---------- */

function DiffLine({ spans, side }: { spans: DiffSpan[]; side: 'before' | 'after' }) {
  const { tones } = useTheme();
  const tone = side === 'before' ? tones.signal : tones.ok;
  return (
    <Text variant="body" color={side === 'before' ? 'ink3' : 'ink'} style={styles.flex}>
      {spans.map((s, i) =>
        s.changed ? (
          <Text
            key={i}
            variant="body"
            style={[{ color: tone.text, backgroundColor: tone.bg }, side === 'before' ? styles.struck : null]}
          >
            {s.text}
          </Text>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </Text>
  );
}

function DiffView({ before, after, label }: { before: string; after: string; label?: string }) {
  const { colors } = useTheme();
  const diff = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <View style={[styles.diff, { borderColor: colors.line }]}>
      {label ? <Text variant="eyebrow">{label}</Text> : null}
      <View style={styles.diffRow} accessible accessibilityLabel={`Before: ${before}`}>
        <Text variant="caption" color="ink4" style={styles.diffTag}>
          Before
        </Text>
        <DiffLine spans={diff.before} side="before" />
      </View>
      <View style={styles.diffRow} accessible accessibilityLabel={`After: ${after}`}>
        <Text variant="caption" color="ink4" style={styles.diffTag}>
          After
        </Text>
        <DiffLine spans={diff.after} side="after" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  italic: { fontStyle: 'italic' },
  linkText: { textDecorationLine: 'underline' },
  markdown: { gap: space[3] },
  list: { gap: space[1] },
  listItem: { flexDirection: 'row', gap: space[2] },
  marker: { minWidth: 18 },
  quote: { borderLeftWidth: 2, paddingLeft: space[3] },
  codeBlock: { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, padding: space[3] },
  divider: { height: StyleSheet.hairlineWidth },
  kv: { borderRadius: radius.input, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space[3] },
  kvRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[3], paddingVertical: space[3] },
  kvLabel: { flex: 1 },
  kvValue: { flex: 1.4 },
  imageBlock: { gap: space[2] },
  imageFrame: {
    aspectRatio: 16 / 9,
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[2], padding: space[4] },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 56,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
  },
  diff: { gap: space[2], borderRadius: radius.input, borderWidth: StyleSheet.hairlineWidth, padding: space[3] },
  diffRow: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  diffTag: { width: 44, paddingTop: 4 },
  struck: { textDecorationLine: 'line-through' },
});
