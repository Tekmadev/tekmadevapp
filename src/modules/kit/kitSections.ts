/**
 * The Kit screen's sections, in order, and the small amount of scroll math the
 * "Jump to" row needs. Pure so it can be unit tested; the two helpers are also
 * worklets because the scroll spy runs on the UI thread.
 */

export const KIT_SECTIONS = [
  { id: 'type', label: 'Typography' },
  { id: 'colours', label: 'Colours' },
  { id: 'loader', label: 'Loader' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'badges', label: 'Badges and chips' },
  { id: 'cards', label: 'Cards and lists' },
  { id: 'states', label: 'States' },
  { id: 'sheets', label: 'Sheets' },
  { id: 'toasts', label: 'Toasts' },
  { id: 'forms', label: 'Forms' },
  { id: 'charts', label: 'Charts' },
  { id: 'automation', label: 'Automation' },
  { id: 'qr', label: 'QR code' },
  { id: 'mock', label: 'Mock API' },
] as const;

export type KitSectionId = (typeof KIT_SECTIONS)[number]['id'];

/** Offset used for a section that has not reported its layout yet. */
export const UNMEASURED = Number.MAX_SAFE_INTEGER;

/** "01" ... "14": the eyebrow above each section title. */
export function sectionNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/**
 * The section the reader is in: the last one whose top is at or above the
 * probe line (a point a little below the sticky "Jump to" row). Offsets are in
 * section order; unmeasured ones are UNMEASURED and never match.
 */
export function activeSectionIndex(offsets: readonly number[], probe: number): number {
  'worklet';
  let active = 0;
  for (let i = 0; i < offsets.length; i++) {
    const top = offsets[i] ?? UNMEASURED;
    if (top <= probe) active = i;
  }
  return active;
}

/**
 * How far to scroll so a section's top lands just under the sticky row.
 * Never negative (the first section sits under the title).
 */
export function jumpTarget(sectionTop: number, stickyHeight: number): number {
  'worklet';
  return Math.max(0, sectionTop - stickyHeight);
}

/**
 * A section above the reader changed height (a lazy one mounted while
 * scrolled past): how far to scroll so what is on screen stays put. Zero when
 * the height did not change or the section reaches into the visible area
 * (then the change is happening where the reader can see it).
 */
export function anchorDelta(
  previous: { top: number; height: number },
  nextHeight: number,
  scrollY: number,
  stickyHeight: number,
): number {
  const delta = nextHeight - previous.height;
  if (delta === 0) return 0;
  const visibleTop = scrollY + stickyHeight;
  return previous.top + previous.height <= visibleTop ? delta : 0;
}
