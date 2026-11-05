// Placeholder temporaneo: vitest esce con code 1 se non trova test.
// Da rimuovere nel Task 2 (prima suite reale: storage).
import { describe, expect, it } from 'vitest';

describe('placeholder', () => {
  it('funziona', () => {
    expect(1 + 1).toBe(2);
  });
});
