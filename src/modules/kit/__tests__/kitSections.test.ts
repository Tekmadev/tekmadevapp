import { ApiError } from '@/api/errors';

import { activeSectionIndex, anchorDelta, jumpTarget, KIT_SECTIONS, sectionNumber, UNMEASURED } from '../kitSections';
import { areaSeries, DONUT_SOURCES, failAfter, sampleClients, sampleValue, seeded } from '../sampleData';

describe('KIT_SECTIONS', () => {
  it('has unique ids and labels', () => {
    const ids = KIT_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(KIT_SECTIONS.map((s) => s.label)).size).toBe(ids.length);
  });

  it('numbers sections from 01', () => {
    expect(sectionNumber(0)).toBe('01');
    expect(sectionNumber(13)).toBe('14');
  });
});

describe('activeSectionIndex', () => {
  const offsets = [100, 600, 1400, 2000];

  it('is the last section whose top is at or above the probe', () => {
    expect(activeSectionIndex(offsets, 0)).toBe(0);
    expect(activeSectionIndex(offsets, 599)).toBe(0);
    expect(activeSectionIndex(offsets, 600)).toBe(1);
    expect(activeSectionIndex(offsets, 1999)).toBe(2);
    expect(activeSectionIndex(offsets, 99_999)).toBe(3);
  });

  it('ignores sections that have not been measured', () => {
    expect(activeSectionIndex([100, UNMEASURED, UNMEASURED], 5000)).toBe(0);
    expect(activeSectionIndex([], 5000)).toBe(0);
  });
});

describe('jumpTarget', () => {
  it('lands the section top just under the sticky row, never above 0', () => {
    expect(jumpTarget(1000, 64)).toBe(936);
    expect(jumpTarget(20, 64)).toBe(0);
  });
});

describe('anchorDelta', () => {
  it('is the growth of a section entirely above the visible area', () => {
    // Section 200..1000 grew to 1500 tall while the reader sat at 2000.
    expect(anchorDelta({ top: 200, height: 800 }, 1500, 2000, 60)).toBe(700);
  });

  it('follows a section that shrank', () => {
    expect(anchorDelta({ top: 200, height: 800 }, 500, 2000, 60)).toBe(-300);
  });

  it('is zero when the section reaches into view or sits below', () => {
    expect(anchorDelta({ top: 1800, height: 800 }, 1500, 2000, 60)).toBe(0);
    expect(anchorDelta({ top: 3000, height: 800 }, 1500, 2000, 60)).toBe(0);
  });

  it('is zero when the height did not change', () => {
    expect(anchorDelta({ top: 200, height: 800 }, 800, 2000, 60)).toBe(0);
  });
});

describe('sample data', () => {
  it('builds 30 daily points ending on the given day, labelled like the API', () => {
    const points = areaSeries(30, '2026-10-01');
    expect(points).toHaveLength(30);
    expect(points[0]?.label).toBe('Sep 2');
    expect(points[29]?.label).toBe('Oct 1');
    expect(points[29]?.title).toBe('Thursday, October 1');
    expect(points.every((p) => Number.isInteger(p.value) && p.value >= 0)).toBe(true);
  });

  it('is deterministic', () => {
    expect(sampleValue(7)).toBe(sampleValue(7));
    expect(seeded(3, 1, 10)).toBe(seeded(3, 1, 10));
    for (let i = 0; i < 50; i++) {
      const v = seeded(i, 5, 9);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('has more donut categories than the seven slots, so Other shows', () => {
    expect(DONUT_SOURCES.length).toBeGreaterThan(7);
  });

  it('makes unique client ids and names for the long sheet', () => {
    const clients = sampleClients(40);
    expect(new Set(clients.map((c) => c.id)).size).toBe(40);
    expect(new Set(clients.map((c) => c.name)).size).toBe(40);
  });

  it('fails with a real ApiError', async () => {
    jest.useFakeTimers();
    const p = failAfter(100);
    jest.advanceTimersByTime(100);
    await expect(p).rejects.toBeInstanceOf(ApiError);
    jest.useRealTimers();
  });
});
