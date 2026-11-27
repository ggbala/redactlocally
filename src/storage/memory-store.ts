import type { TextMappingSnapshot, TextMappingStore } from './types';

function formatDisplayTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Helper to create a fresh TextMappingSnapshot from sanitization results.
 */
export function createTextMappingSnapshot(
  params: {
    entries: TextMappingSnapshot['entries'];
    totalReplacements: number;
    categoryCounts: Record<string, number>;
  },
  now: Date = new Date(),
): TextMappingSnapshot {
  return {
    createdAt: now.toISOString(),
    displayTime: formatDisplayTime(now),
    entries: params.entries.map((e) => ({ ...e })),
    entryCount: params.entries.length,
    totalReplacements: params.totalReplacements,
    categoryCounts: { ...params.categoryCounts },
  };
}

/**
 * Text Mode memory-only store.
 * Every sanitize run completely overwrites the previous mapping snapshot.
 * Never persisted to IndexedDB or localStorage — cleared automatically on reload/tab close.
 */
export class InMemoryTextMappingStore implements TextMappingStore {
  private current: TextMappingSnapshot | null = null;

  getCurrent(): TextMappingSnapshot | null {
    if (!this.current) {
      return null;
    }
    return {
      ...this.current,
      entries: this.current.entries.map((e) => ({ ...e })),
      categoryCounts: { ...this.current.categoryCounts },
    };
  }

  overwrite(snapshot: TextMappingSnapshot): void {
    this.current = {
      ...snapshot,
      entries: snapshot.entries.map((e) => ({ ...e })),
      categoryCounts: { ...snapshot.categoryCounts },
    };
  }

  clear(): void {
    this.current = null;
  }
}
