import { describe, expect, test } from 'bun:test';

import { fitColumnWidths } from './decorate';

const total = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0);

describe('fitColumnWidths', () => {
  test('leaves a table that already fits untouched', () => {
    expect(fitColumnWidths([120, 300, 400], 900)).toEqual([120, 300, 400]);
  });

  test('narrows only the wide columns and keeps short ones whole', () => {
    const fitted = fitColumnWidths([120, 380, 1400], 1000);
    expect(fitted[0]).toBe(120);
    expect(fitted[1]).toBe(380);
    expect(fitted[2]).toBe(500);
    expect(total(fitted)).toBeLessThanOrEqual(1000);
  });

  test('shares the space evenly between several wide columns', () => {
    const fitted = fitColumnWidths([800, 800, 800], 900);
    expect(fitted).toEqual([300, 300, 300]);
  });

  test('never goes below the minimum column width', () => {
    expect(fitColumnWidths([600, 600, 600, 600], 300)).toEqual([120, 120, 120, 120]);
  });

  test('does nothing without a measured width', () => {
    expect(fitColumnWidths([600, 600], 0)).toEqual([600, 600]);
  });
});
