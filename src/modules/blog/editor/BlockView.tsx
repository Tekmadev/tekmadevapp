import { Info, Lightbulb, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type TextStyle } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { BlockOf, BlogBlock, CalloutVariant } from '@/api/schemas/blog';
import { openInBrowser } from '@/components/automation/ApprovalBlocks';
import { isSafeHref, parseInline, type InlineSpan } from '@/components/automation/markdown';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text, type TextColor } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space, type Tone } from '@/design/tokens';
import { fonts, type TypeVariant } from '@/design/typography';

import { ImagePreview } from './ImagePreview';
import { siteUrl } from './form';

/**
 * The Preview's body blocks (POST /blog/render), styled like the public
 * article: Geist 700 headings, 17/28 body text, answer blocks as a
 * gold-bordered "short answer" card, callouts with an icon per variant,
 * tables that scroll sideways, and the CTA as an ink card with a pill button.
 * Block text is inline Markdown (bold, italic, code, links).
 */

/** A link in the article: site paths open on tekmadev.com, other web and mail links as they are. */
function hrefFor(href: string | undefined): string | null {
  if (!href) return null;
  const url = siteUrl(href);
  return isSafeHref(url) ? url : null;
}

type InlineProps = { text: string; variant: TypeVariant; color: TextColor; style?: TextStyle };

/** Inline Markdown as nested Text; links are the one tap target inside running text. */
export function Inline({ text, variant, color, style }: InlineProps) {
  const { colors } = useTheme();
  const spans: InlineSpan[] = parseInline(text);
  return (
    <Text variant={variant} color={color} style={style}>
      {spans.map((s, i) => {
        // Each nested Text applies its full type style, so the caller's override is repeated here.
        const spanStyle: TextStyle[] = style ? [style] : [];
        if (s.bold) spanStyle.push(styles.bold);
        if (s.italic) spanStyle.push(styles.italic);
        if (s.code) spanStyle.push({ fontFamily: fonts.mono, backgroundColor: colors.bg3 });
        const href = hrefFor(s.href);
        if (href) {
          return (
            <Text
              key={i}
              variant={variant}
              tone="gold"
              accessibilityRole="link"
              style={[...spanStyle, styles.link]}
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
          <Text key={i} variant={variant} color={color} style={spanStyle}>
            {s.text}
          </Text>
        );
      })}
    </Text>
  );
}

/** Quote, callout and answer text: a blank quoted line arrives as "\n\n" (a new paragraph). */
function Paragraphs({ text, variant, color }: { text: string; variant: TypeVariant; color: TextColor }) {
  const parts = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <View style={styles.paragraphs}>
      {parts.map((p, i) => (
        <Inline key={i} text={p} variant={variant} color={color} />
      ))}
    </View>
  );
}

const CALLOUTS: Record<CalloutVariant, { icon: LucideIcon; tone: Tone; label: string }> = {
  tip: { icon: Lightbulb, tone: 'ok', label: 'Tip' },
  info: { icon: Info, tone: 'gold', label: 'Info' },
  warning: { icon: TriangleAlert, tone: 'warn', label: 'Warning' },
};

function Heading({ block }: { block: BlockOf<'heading'> }) {
  const variant: TypeVariant = block.level === 2 ? 'headline' : block.level === 3 ? 'headlineSmall' : 'title';
  return (
    <Inline
      text={block.text}
      variant={variant}
      color="ink"
      style={block.level === 3 ? styles.h3 : block.level === 4 ? styles.h4 : undefined}
    />
  );
}

function ListBlock({ block }: { block: BlockOf<'list'> }) {
  return (
    <View style={styles.list}>
      {block.items.map((item, i) => (
        <View key={i} style={styles.listItem}>
          <Text variant="editor" color="ink3" tabular style={styles.marker}>
            {block.ordered ? `${i + 1}.` : '•'}
          </Text>
          <View style={styles.flex}>
            <Inline text={item} variant="editor" color="ink2" />
          </View>
        </View>
      ))}
    </View>
  );
}

function Callout({ block }: { block: BlockOf<'callout'> }) {
  const { tones } = useTheme();
  const spec = CALLOUTS[block.variant ?? 'info'];
  return (
    <View style={[styles.callout, { backgroundColor: tones[spec.tone].bg }]}>
      <View style={styles.calloutHead}>
        <Icon icon={spec.icon} size={18} tone={spec.tone} strokeWidth={2} />
        <Text variant="eyebrow" tone={spec.tone}>
          {spec.label}
        </Text>
      </View>
      <Paragraphs text={block.text} variant="body" color="ink2" />
    </View>
  );
}

function Answer({ block }: { block: BlockOf<'answer'> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.answer, { borderColor: colors.gold, backgroundColor: colors.goldTint }]}>
      <Text variant="eyebrow" tone="gold">
        Short answer
      </Text>
      {block.question ? <Inline text={block.question} variant="title" color="ink" style={styles.answerQuestion} /> : null}
      <Paragraphs text={block.text} variant="body" color="ink2" />
    </View>
  );
}

/** Columns are wide enough to read on a phone; the table scrolls sideways when they do not fit. */
const COLUMN_WIDTH = 160;

function Table({ block }: { block: BlockOf<'table'> }) {
  const { colors } = useTheme();
  const rows = [block.headers, ...block.rows];
  return (
    <View style={[styles.tableFrame, { borderColor: colors.lineStrong }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
        <View>
          {rows.map((row, r) => (
            <View
              key={r}
              style={[
                styles.tableRow,
                r === 0 ? { backgroundColor: colors.bg3 } : { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
              ]}
            >
              {row.map((cell, c) => (
                <View key={c} style={styles.cell}>
                  <Inline text={cell} variant={r === 0 ? 'label' : 'small'} color={r === 0 ? 'ink' : 'ink2'} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Code({ block }: { block: BlockOf<'code'> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.code, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.codeInner}>
        <Text variant="mono" color="ink2">
          {block.code}
        </Text>
      </ScrollView>
    </View>
  );
}

function Cta({ block }: { block: BlockOf<'cta'> }) {
  const { colors } = useTheme();
  const href = hrefFor(block.href);
  return (
    <View style={[styles.cta, { backgroundColor: colors.ink }]}>
      <Text variant="headlineSmall" color="onInk">
        {block.heading}
      </Text>
      {block.body ? <Inline text={block.body} variant="body" color="onInk" /> : null}
      <PressableScale
        disabled={!href}
        onPress={() => {
          if (href) openInBrowser(href, colors);
        }}
        accessibilityRole="link"
        accessibilityLabel={block.buttonLabel}
        accessibilityHint={href ? `Opens ${href}` : undefined}
        style={[styles.ctaButton, { backgroundColor: colors.bg }]}
      >
        <Text variant="button" color="ink" numberOfLines={1}>
          {block.buttonLabel}
        </Text>
      </PressableScale>
    </View>
  );
}

/** One body block. A block type this build does not know (a newer server) renders nothing. */
export function BlockView({ block }: { block: BlogBlock }) {
  const { colors } = useTheme();
  switch (block.type) {
    case 'heading':
      return <Heading block={block} />;
    case 'paragraph':
      return <Inline text={block.text} variant="editor" color="ink2" />;
    case 'list':
      return <ListBlock block={block} />;
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: colors.goldSoft }]}>
          <Paragraphs text={block.text} variant="editor" color="ink3" />
        </View>
      );
    case 'callout':
      return <Callout block={block} />;
    case 'answer':
      return <Answer block={block} />;
    case 'image':
      return (
        <View style={styles.figure}>
          <ImagePreview key={block.url} url={block.url} alt={block.alt} />
          {block.caption ? (
            <Text variant="small" color="ink3" align="center">
              {block.caption}
            </Text>
          ) : null}
        </View>
      );
    case 'table':
      return <Table block={block} />;
    case 'code':
      return <Code block={block} />;
    case 'cta':
      return <Cta block={block} />;
    case 'divider':
      return <View style={[styles.divider, { backgroundColor: colors.line }]} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  link: { textDecorationLine: 'underline' },
  h3: { fontSize: 20, lineHeight: 26 },
  h4: { fontWeight: '700' },
  paragraphs: { gap: space[3] },
  list: { gap: space[2] },
  listItem: { flexDirection: 'row', gap: space[2] },
  marker: { minWidth: 22 },
  quote: { borderLeftWidth: 3, paddingLeft: space[4] },
  callout: { borderRadius: radius.input, padding: space[4], gap: space[2] },
  calloutHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  answer: { borderRadius: radius.input, borderWidth: 1.5, padding: space[4], gap: space[2] },
  answerQuestion: { fontWeight: '700' },
  figure: { gap: space[2] },
  tableFrame: { borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden' },
  tableRow: { flexDirection: 'row' },
  cell: { width: COLUMN_WIDTH, paddingHorizontal: space[3], paddingVertical: space[2] + 2 },
  code: { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  codeInner: { padding: space[3] },
  cta: { borderRadius: radius.card, padding: space[5], gap: space[3] },
  ctaButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
    marginTop: space[1],
  },
  divider: { height: 1, marginVertical: space[2] },
});
