import { describe, expect, it } from 'vitest';
import {
  InMemoryTextMappingStore,
  createTextMappingSnapshot,
} from '@/storage/memory-store';
import { createDefaultEngine } from '@/core/engine';

describe('InMemoryTextMappingStore (Text Mode Overwrite Semantics)', () => {
  const engine = createDefaultEngine();

  it('starts empty, stores snapshot in memory, and completely overwrites on subsequent sanitize', () => {
    const store = new InMemoryTextMappingStore();
    expect(store.getCurrent()).toBeNull();

    // First sanitize: 4 items
    const run1 = engine.sanitizeTextSync(
      'alice@acme.com, bob@acme.com, 10.0.0.1, AKIAIOSFODNN7EXAMPLE',
    );
    const snap1 = createTextMappingSnapshot(
      run1,
      new Date('2026-11-27T14:32:08.000Z'),
    );
    store.overwrite(snap1);

    const afterRun1 = store.getCurrent();
    expect(afterRun1).not.toBeNull();
    expect(afterRun1!.entryCount).toBe(4);
    expect(afterRun1!.createdAt).toBe('2026-11-27T14:32:08.000Z');
    expect(afterRun1!.displayTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    // Second sanitize: 2 items -> must completely replace previous 4 items
    const run2 = engine.sanitizeTextSync(
      'carol@acme.com and 192.168.1.9',
    );
    const snap2 = createTextMappingSnapshot(
      run2,
      new Date('2026-11-27T14:35:12.000Z'),
    );
    store.overwrite(snap2);

    const afterRun2 = store.getCurrent();
    expect(afterRun2).not.toBeNull();
    expect(afterRun2!.entryCount).toBe(2);
    expect(afterRun2!.createdAt).toBe('2026-11-27T14:35:12.000Z');
    expect(afterRun2!.entries.map((e) => e.originalValue)).toEqual([
      'carol@acme.com',
      '192.168.1.9',
    ]);
    // Ensure old values from run 1 are completely gone
    expect(
      afterRun2!.entries.some((e) => e.originalValue === 'alice@acme.com'),
    ).toBe(false);

    // Clear resets to null
    store.clear();
    expect(store.getCurrent()).toBeNull();
  });

  it('returns defensive clones so external mutations cannot corrupt stored mappings', () => {
    const store = new InMemoryTextMappingStore();
    const run = engine.sanitizeTextSync('ops@acme.com');
    store.overwrite(createTextMappingSnapshot(run));

    const fetched = store.getCurrent()!;
    fetched.entries[0].originalValue = 'MUTATED';

    expect(store.getCurrent()!.entries[0].originalValue).toBe('ops@acme.com');
  });
});
