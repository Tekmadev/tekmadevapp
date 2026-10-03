import { BLOG_MEDIA_MAX_BYTES } from '@/api/schemas/blog';

import { fitsLimit, keepsOriginal, MAX_IMAGE_WIDTH, QUALITY_STEPS, resizeWidth, uploadFileName } from '../process';

describe('resizing', () => {
  it('resizes only images wider than 2400px, down to 2400px', () => {
    expect(MAX_IMAGE_WIDTH).toBe(2400);
    expect(resizeWidth(4032)).toBe(2400);
    expect(resizeWidth(2401)).toBe(2400);
    expect(resizeWidth(2400)).toBeNull();
    expect(resizeWidth(1200)).toBeNull();
  });
});

describe('compression', () => {
  it('lowers the quality step by step', () => {
    expect(QUALITY_STEPS.length).toBeGreaterThan(1);
    for (let i = 1; i < QUALITY_STEPS.length; i++) expect(QUALITY_STEPS[i]).toBeLessThan(QUALITY_STEPS[i - 1]);
    expect(QUALITY_STEPS.every((q) => q > 0 && q <= 1)).toBe(true);
  });

  it('fits files that are not empty and at most 10 MB', () => {
    expect(fitsLimit(1)).toBe(true);
    expect(fitsLimit(BLOG_MEDIA_MAX_BYTES)).toBe(true);
    expect(fitsLimit(BLOG_MEDIA_MAX_BYTES + 1)).toBe(false);
    expect(fitsLimit(0)).toBe(false);
  });
});

describe('keepsOriginal', () => {
  it('keeps a GIF that already fits, so it stays animated', () => {
    expect(keepsOriginal({ mimeType: 'image/gif', width: 800, fileSize: 2_000_000 })).toBe(true);
    expect(keepsOriginal({ mimeType: 'IMAGE/GIF', width: 2400, fileSize: 2_000_000 })).toBe(true);
  });

  it('re-encodes everything else', () => {
    expect(keepsOriginal({ mimeType: 'image/gif', width: 3000, fileSize: 2_000_000 })).toBe(false);
    expect(keepsOriginal({ mimeType: 'image/gif', width: 800, fileSize: BLOG_MEDIA_MAX_BYTES + 1 })).toBe(false);
    expect(keepsOriginal({ mimeType: 'image/gif', width: 800, fileSize: null })).toBe(false);
    expect(keepsOriginal({ mimeType: 'image/gif', width: 0, fileSize: 2_000_000 })).toBe(false);
    expect(keepsOriginal({ mimeType: 'image/jpeg', width: 800, fileSize: 100_000 })).toBe(false);
    expect(keepsOriginal({ mimeType: null, width: 800, fileSize: 100_000 })).toBe(false);
  });
});

describe('uploadFileName', () => {
  it('swaps the extension', () => {
    expect(uploadFileName('IMG_2041.HEIC', 'webp')).toBe('IMG_2041.webp');
    expect(uploadFileName('van at the job.final.png', 'jpg')).toBe('van at the job.final.jpg');
  });

  it('drops folders and tidies spaces', () => {
    expect(uploadFileName('/storage/emulated/0/DCIM/  my   photo .jpg', 'webp')).toBe('my photo.webp');
  });

  it('names camera shots without a name', () => {
    expect(uploadFileName(null, 'webp')).toBe('photo.webp');
    expect(uploadFileName('', 'gif')).toBe('photo.gif');
    expect(uploadFileName('.jpg', 'webp')).toBe('photo.webp');
  });

  it('keeps names readable but short', () => {
    expect(uploadFileName(`${'a'.repeat(200)}.png`, 'webp')).toBe(`${'a'.repeat(80)}.webp`);
  });
});
