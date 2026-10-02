import type { Agreement } from '@/api/schemas/clients';

import { agreementLine, HASH_PREFIX, shortHash } from '../agreementText';
import { extensionOf, fileFamily, opensInViewer } from '../fileTypes';
import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  backdropOpacity,
  doubleTapTarget,
  fitSize,
  maxOffset,
  pinchTranslate,
  resistScale,
  shouldDismiss,
} from '../zoomMath';

// Icons are opaque here (Jest hoists this above the imports): each name stands in for its icon.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_t, name) => (name === '__esModule' ? false : String(name)) }));

describe('zoomMath', () => {
  it('fits an image inside the box, keeping its ratio', () => {
    expect(fitSize(400, 800, 2000, 1000)).toEqual({ width: 400, height: 200 });
    expect(fitSize(400, 800, null, null)).toEqual({ width: 400, height: 800 });
  });

  it('only lets a zoomed image move as far as its edges', () => {
    expect(maxOffset(400, 400, 1)).toBe(0);
    expect(maxOffset(400, 400, 2)).toBe(200);
    expect(maxOffset(200, 800, 2)).toBe(0);
  });

  it('keeps the point under the fingers steady while pinching', () => {
    // Content point under the focal point 100 (translate 0, scale 1) is 100; at scale 2 it must stay at 100.
    const t = pinchTranslate(100, 100, 0, 1, 2);
    expect(t + 2 * 100).toBe(100);
    // Fingers that move carry the image with them.
    expect(pinchTranslate(100, 140, 0, 1, 1)).toBe(40);
  });

  it('resists a pinch past the limits', () => {
    expect(resistScale(2)).toBe(2);
    expect(resistScale(0.5)).toBeGreaterThan(0.5);
    expect(resistScale(0.5)).toBeLessThan(MIN_SCALE);
    expect(resistScale(6)).toBeGreaterThan(MAX_SCALE);
    expect(resistScale(6)).toBeLessThan(6);
  });

  it('double tap zooms in on the point, then back out', () => {
    const box = { width: 400, height: 800 };
    const content = { width: 400, height: 300 };
    const zin = doubleTapTarget({ x: 50, y: 0 }, { x: 0, y: 0 }, 1, content, box);
    expect(zin.scale).toBe(DOUBLE_TAP_SCALE);
    expect(Math.abs(zin.x)).toBeLessThanOrEqual(maxOffset(400, 400, DOUBLE_TAP_SCALE));
    expect(zin.y).toBe(0);
    expect(doubleTapTarget({ x: 50, y: 0 }, { x: 10, y: 0 }, 2, content, box)).toEqual({ scale: MIN_SCALE, x: 0, y: 0 });
  });

  it('closes on a long or fast swipe down only', () => {
    expect(shouldDismiss(200, 0, 800)).toBe(true);
    expect(shouldDismiss(40, 1200, 800)).toBe(true);
    expect(shouldDismiss(40, 200, 800)).toBe(false);
    expect(shouldDismiss(10, 2000, 800)).toBe(false);
  });

  it('never fades the backdrop out completely', () => {
    expect(backdropOpacity(0, 800)).toBe(1);
    expect(backdropOpacity(10_000, 800)).toBeCloseTo(0.25);
  });
});

describe('fileTypes', () => {
  it('reads the extension for the tile label', () => {
    expect(extensionOf('price-list.pdf')).toBe('PDF');
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.env')).toBe('');
    expect(extensionOf('archive.verylongext')).toBe('');
  });

  it('lets the mime type decide, and the extension only for generic types', () => {
    expect(fileFamily('image/jpeg', 'a.bin')).toBe('image');
    expect(fileFamily('application/pdf', 'a')).toBe('pdf');
    expect(fileFamily('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a')).toBe('sheet');
    expect(fileFamily('application/octet-stream', 'logo.PNG')).toBe('image');
    expect(fileFamily('application/octet-stream', 'notes')).toBe('other');
  });

  it('opens images in the viewer and everything else in the browser', () => {
    expect(opensInViewer({ mime: 'image/png', fileName: 'logo.png' })).toBe(true);
    expect(opensInViewer({ mime: 'application/pdf', fileName: 'brief.pdf' })).toBe(false);
  });
});

describe('agreementText', () => {
  const base: Agreement = {
    id: 'agr_1',
    clientId: 'cl_1',
    title: 'Service agreement',
    version: 2,
    status: 'sent',
    sentAt: '2026-09-10T14:00:00.000000Z',
    viewedAt: null,
    acceptedAt: null,
    acceptedByName: null,
    acceptedByEmail: null,
    contentHash: '  9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  };
  const now = new Date('2026-10-02T12:00:00Z');

  it('shortens the hash to a fixed prefix', () => {
    expect(shortHash(base.contentHash)).toBe('9f86d081884c');
    expect(shortHash(base.contentHash)).toHaveLength(HASH_PREFIX);
  });

  it('says who accepted, or when it was sent', () => {
    const accepted = agreementLine(
      { ...base, status: 'signed', acceptedAt: '2026-09-12T15:30:00Z', acceptedByName: 'Dana Reyes', acceptedByEmail: 'dana@acme.test' },
      now,
    );
    expect(accepted).toMatch(/^Accepted Sep 12, .+ by Dana Reyes \(dana@acme\.test\)$/);
    expect(agreementLine(base, now)).toMatch(/^Sent Sep 10, /);
    expect(agreementLine({ ...base, status: 'draft', sentAt: null }, now)).toBeNull();
  });
});
