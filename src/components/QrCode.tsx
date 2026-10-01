import { Canvas, FitBox, Group, ImageFormat, Path, Rect, RoundedRect, Skia, rect, useCanvasRef, type SkPath } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import qrcodeGenerator from 'qrcode-generator';
import { useImperativeHandle, useMemo, type Ref } from 'react';
import { PixelRatio, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { palettes, radius } from '@/design/tokens';
import { LOGO_PATHS, LOGO_VIEWBOX } from '@/loader/logoPaths';

/**
 * A QR code card (brief 8.11, Links): dark modules on a white card with the
 * gold logo mark in the centre, drawn with Skia so it is crisp at any size
 * and can be saved as a PNG.
 *
 * The card is white and the modules near-black in BOTH themes. That is on
 * purpose and the one place the app ignores dark mode: scanners need dark on
 * light, and a saved PNG must work when printed. The colours still come from
 * the light palette tokens, never from literals.
 */

export type QrCodeHandle = {
  /**
   * Writes the card as a PNG into the cache directory and returns its file
   * uri (for expo-sharing or the media library), or null when it failed.
   * Pass a file name to control what share targets show (".png" is added).
   */
  snapshot: (fileName?: string) => Promise<string | null>;
};

export type QrCodeProps = {
  /** What the code opens, e.g. "https://www.tekmadev.com/start". Encoded as UTF-8. */
  value: string;
  /** Card size in dp (default 264). */
  size?: number;
  /** The gold mark in the centre (default true). */
  logo?: boolean;
  /** TalkBack label (default "QR code for <value>"). */
  accessibilityLabel?: string;
  ref?: Ref<QrCodeHandle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** The quiet zone the QR spec asks for, in modules, on every side. */
const QUIET = 4;
/** The logo plate stays under this share of the code's width (error correction H recovers about 30%). */
const LOGO_MAX_SHARE = 0.2;

const INK = palettes.light.ink;
const PAPER = palettes.light.surface;
const MARK = palettes.light.gold;

export type QrMatrix = {
  /** Modules per side, without the quiet zone. */
  count: number;
  /** Row-major dark flags, `count * count` long. */
  dark: boolean[];
};

/**
 * UTF-8 bytes as a "binary string" (one char per byte). qrcode-generator's
 * default byte mode keeps the low 8 bits of each char, so this sends real
 * UTF-8 without swapping the library's global encoder.
 */
export function utf8ByteString(value: string): string {
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) out += String.fromCharCode(cp);
    else if (cp < 0x800) out += String.fromCharCode(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out += String.fromCharCode(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else
      out += String.fromCharCode(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return out;
}

/** The module grid at error correction H, smallest version that fits. Null when the value is too long. */
export function makeQrMatrix(value: string): QrMatrix | null {
  try {
    const qr = qrcodeGenerator(0, 'H');
    qr.addData(utf8ByteString(value), 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    const dark = new Array<boolean>(count * count);
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) dark[r * count + c] = qr.isDark(r, c);
    return { count, dark };
  } catch {
    return null;
  }
}

/**
 * Side of the cleared centre block, in whole modules: odd so it centres on a
 * module, and strictly under LOGO_MAX_SHARE of the code's width.
 */
export function logoModules(count: number): number {
  let n = Math.ceil(count * LOGO_MAX_SHARE) - 1;
  if (n % 2 === 0) n -= 1;
  return Math.max(n, 0);
}

type Geometry = {
  modules: SkPath;
  /** Module size and code origin in dp. */
  cell: number;
  origin: number;
  /** Cleared centre block (dp), or null without a logo. */
  plate: { x: number; y: number; side: number } | null;
};

/**
 * Every dark module in one path (runs of a row merged into one rect), so
 * neighbouring modules never show anti-aliasing seams. The module size is
 * snapped to whole device pixels, which keeps every edge sharp on screen and
 * in the PNG.
 */
function buildGeometry(matrix: QrMatrix, size: number, withLogo: boolean): Geometry {
  const { count, dark } = matrix;
  const total = count + QUIET * 2;
  const ratio = PixelRatio.get();
  const cellPx = Math.max(1, Math.floor((size * ratio) / total));
  const cell = cellPx / ratio;
  // Whatever does not divide evenly becomes extra quiet zone, split on both sides.
  const origin = (Math.floor((size * ratio - cellPx * total) / 2) + cellPx * QUIET) / ratio;

  const hole = withLogo ? logoModules(count) : 0;
  const holeStart = Math.floor((count - hole) / 2);
  const holeEnd = holeStart + hole;
  const inHole = (r: number, c: number) => hole > 0 && r >= holeStart && r < holeEnd && c >= holeStart && c < holeEnd;

  const builder = Skia.PathBuilder.Make();
  for (let r = 0; r < count; r++) {
    let c = 0;
    while (c < count) {
      if (!dark[r * count + c] || inHole(r, c)) {
        c++;
        continue;
      }
      const from = c;
      while (c < count && dark[r * count + c] && !inHole(r, c)) c++;
      builder.addRect(rect(origin + from * cell, origin + r * cell, (c - from) * cell, cell));
    }
  }

  return {
    modules: builder.build(),
    cell,
    origin,
    plate: hole > 0 ? { x: origin + holeStart * cell, y: origin + holeStart * cell, side: hole * cell } : null,
  };
}

/** The four logo pieces as one path, in the artwork's own coordinates. */
function buildMark(): SkPath | null {
  const builder = Skia.PathBuilder.Make();
  for (const piece of LOGO_PATHS) {
    const path = Skia.Path.MakeFromSVGString(piece.d);
    if (!path) return null;
    builder.addPath(path);
  }
  return builder.build();
}

const MARK_SOURCE = rect(LOGO_VIEWBOX.x, LOGO_VIEWBOX.y, LOGO_VIEWBOX.width, LOGO_VIEWBOX.height);

/** File names safe on every share target: "tekmadev-qr-start.png". */
function pngName(value: string, fileName?: string): string {
  const base = (fileName ?? `tekmadev-qr-${value.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/).filter(Boolean).pop() ?? 'link'}`)
    .replace(/\.png$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'tekmadev-qr'}.png`;
}

export function QrCode({ value, size = 264, logo = true, accessibilityLabel, ref, style, testID }: QrCodeProps) {
  const { colors } = useTheme();
  const canvasRef = useCanvasRef();

  const matrix = useMemo(() => makeQrMatrix(value), [value]);
  const geometry = useMemo(() => (matrix ? buildGeometry(matrix, size, logo) : null), [matrix, size, logo]);
  const mark = useMemo(() => (logo ? buildMark() : null), [logo]);

  useImperativeHandle(
    ref,
    () => ({
      snapshot: async (fileName?: string) => {
        try {
          const image = await canvasRef.current?.makeImageSnapshotAsync();
          if (!image) return null;
          const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
          image.dispose();
          if (bytes.length === 0) return null;
          const file = new File(Paths.cache, pngName(value, fileName));
          file.create({ overwrite: true });
          file.write(bytes);
          return file.uri;
        } catch {
          return null;
        }
      },
    }),
    [canvasRef, value],
  );

  const frame = [styles.card, { width: size, height: size, backgroundColor: PAPER }, style];
  // The border is drawn over the canvas (not on the frame), so the canvas is exactly `size` square.
  const border = <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.border, { borderColor: colors.line }]} />;

  if (!geometry) {
    // Only a value longer than a QR code can hold gets here (about 1,200 bytes at level H).
    return (
      <View style={[frame, styles.failed]} testID={testID}>
        <Text variant="small" align="center" style={{ color: INK }}>
          This link is too long for a QR code.
        </Text>
        {border}
      </View>
    );
  }

  const { plate, cell } = geometry;
  // The mark sits inside the plate with a little white around it.
  const inset = plate ? Math.max(cell * 0.6, plate.side * 0.1) : 0;

  return (
    <View
      style={frame}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `QR code for ${value}`}
      testID={testID}
    >
      <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={size} height={size} color={PAPER} />
        <Path path={geometry.modules} color={INK} />
        {plate ? (
          <Group>
            <RoundedRect x={plate.x} y={plate.y} width={plate.side} height={plate.side} r={cell * 1.25} color={PAPER} />
            {mark ? (
              <FitBox
                src={MARK_SOURCE}
                dst={rect(plate.x + inset, plate.y + inset, plate.side - inset * 2, plate.side - inset * 2)}
              >
                <Path path={mark} color={MARK} />
              </FitBox>
            ) : null}
          </Group>
        ) : null}
      </Canvas>
      {border}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: 'hidden' },
  border: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth * 2 },
  failed: { alignItems: 'center', justifyContent: 'center', padding: 24 },
});
