import type {
  DetectedEntity,
  MappingEntry,
  RestoreVerificationDiff,
} from './types';
import { createDiffAccumulator } from './diff';

/**
 * Matches placeholder tokens such as [EMAIL_1], [AWS_KEY_12], [CUSTOM_3].
 */
export const PLACEHOLDER_TOKEN_PATTERN = /\[([A-Z][A-Z0-9_]*)_(\d+)\]/g;

export function escapeRegexForPlaceholder(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves overlapping entity spans deterministically:
 * 1. Higher rule priority wins
 * 2. Longer match span wins
 * 3. Earlier start offset wins
 * Returns accepted non-overlapping entities sorted by start offset ascending.
 */
export function resolveOverlaps(
  entities: readonly DetectedEntity[],
): DetectedEntity[] {
  const valid = entities.filter(
    (e) =>
      Number.isFinite(e.start) &&
      Number.isFinite(e.end) &&
      e.start >= 0 &&
      e.end > e.start &&
      e.rawValue.length > 0,
  );

  if (valid.length <= 1) {
    return [...valid];
  }

  const ranked = [...valid].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) {
      return lenDiff;
    }
    return a.start - b.start;
  });

  const accepted: DetectedEntity[] = [];

  for (const candidate of ranked) {
    const overlapsExisting = accepted.some(
      (existing) => candidate.start < existing.end && existing.start < candidate.end,
    );
    if (!overlapsExisting) {
      accepted.push(candidate);
    }
  }

  accepted.sort((a, b) => a.start - b.start);
  return accepted;
}

/**
 * Allocates deterministic, collision-free placeholders across one or more text chunks
 * within a single sanitization run.
 */
export class PlaceholderAllocator {
  private readonly reservedIndices = new Map<string, Set<number>>();
  private readonly nextCounter = new Map<string, number>();
  private readonly valueToPlaceholder = new Map<string, string>();
  private readonly entriesByPlaceholder = new Map<string, MappingEntry>();

  /**
   * Scans source text for existing literal placeholders (e.g. "[EMAIL_1]")
   * so newly generated indices automatically skip them and prevent restore collisions.
   */
  reserveExistingPlaceholders(text: string): void {
    if (!text) {
      return;
    }

    PLACEHOLDER_TOKEN_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = PLACEHOLDER_TOKEN_PATTERN.exec(text)) !== null) {
      const prefix = match[1];
      const index = Number(match[2]);
      if (!Number.isInteger(index) || index < 1) {
        continue;
      }

      let reserved = this.reservedIndices.get(prefix);
      if (!reserved) {
        reserved = new Set<number>();
        this.reservedIndices.set(prefix, reserved);
      }
      reserved.add(index);
    }
  }

  /**
   * Returns a consistent placeholder for the given entity, creating a new collision-free
   * index on first occurrence and incrementing the occurrence count.
   */
  allocate(entity: DetectedEntity): string {
    const existingPlaceholder = this.valueToPlaceholder.get(entity.rawValue);
    if (existingPlaceholder) {
      const entry = this.entriesByPlaceholder.get(existingPlaceholder);
      if (entry) {
        entry.count += 1;
      }
      return existingPlaceholder;
    }

    const prefix = entity.placeholderPrefix;
    const reserved = this.reservedIndices.get(prefix);
    let candidate = (this.nextCounter.get(prefix) ?? 0) + 1;

    while (reserved?.has(candidate)) {
      candidate += 1;
    }

    this.nextCounter.set(prefix, candidate);
    const placeholder = `[${prefix}_${candidate}]`;

    this.valueToPlaceholder.set(entity.rawValue, placeholder);
    this.entriesByPlaceholder.set(placeholder, {
      placeholder,
      originalValue: entity.rawValue,
      ruleId: entity.ruleId,
      category: entity.category,
      count: 1,
    });

    return placeholder;
  }

  getEntries(): MappingEntry[] {
    return Array.from(this.entriesByPlaceholder.values()).map((e) => ({ ...e }));
  }

  getTotalReplacements(): number {
    let total = 0;
    for (const entry of this.entriesByPlaceholder.values()) {
      total += entry.count;
    }
    return total;
  }
}

export interface TextSpanReplacement {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Replaces resolved non-overlapping entities in `text` using the provided allocator.
 */
export function applyEntityReplacements(
  text: string,
  entities: readonly DetectedEntity[],
  allocator: PlaceholderAllocator,
): string {
  if (entities.length === 0) {
    return text;
  }

  let output = '';
  let cursor = 0;

  for (const entity of entities) {
    if (entity.start < cursor) {
      continue;
    }
    output += text.slice(cursor, entity.start);
    output += allocator.allocate(entity);
    cursor = entity.end;
  }

  output += text.slice(cursor);
  return output;
}

/**
 * Computes exact span replacements for resolved non-overlapping entities without mutating a single flat string.
 * Ideal for XML run-level (Word .docx) and RichText (Excel .xlsx) format-preserving replacement.
 */
export function buildEntitySpanReplacements(
  entities: readonly DetectedEntity[],
  allocator: PlaceholderAllocator,
): TextSpanReplacement[] {
  const spans: TextSpanReplacement[] = [];
  let cursor = 0;

  for (const entity of entities) {
    if (entity.start < cursor) {
      continue;
    }
    spans.push({
      start: entity.start,
      end: entity.end,
      replacement: allocator.allocate(entity),
    });
    cursor = entity.end;
  }

  return spans;
}

/**
 * Single-pass length-descending placeholder restorer.
 * Guarantees:
 * - [EMAIL_10] is never corrupted by [EMAIL_1]
 * - Restored original values containing placeholder-like strings are never double-replaced
 */
export class PlaceholderRestorer {
  private readonly entryMap: Map<string, MappingEntry>;
  private readonly replaceRegex: RegExp | null;

  constructor(entries: readonly MappingEntry[]) {
    this.entryMap = new Map();
    for (const entry of entries) {
      this.entryMap.set(entry.placeholder, entry);
    }

    if (this.entryMap.size === 0) {
      this.replaceRegex = null;
    } else {
      // Sort placeholders by length descending so longer indices ([EMAIL_10]) always match first
      const sortedPlaceholders = Array.from(this.entryMap.keys()).sort(
        (a, b) => b.length - a.length,
      );
      const pattern = sortedPlaceholders
        .map(escapeRegexForPlaceholder)
        .join('|');
      this.replaceRegex = new RegExp(pattern, 'g');
    }
  }

  /**
   * Computes single-pass length-descending restoration spans for XML/RichText run-level replacement
   * while accurately recording replaced and unknown counts into the shared DiffAccumulator.
   */
  getRestoreSpans(
    text: string,
    diffAccumulator?: ReturnType<typeof createDiffAccumulator>,
  ): TextSpanReplacement[] {
    if (!text) {
      return [];
    }

    if (diffAccumulator) {
      PLACEHOLDER_TOKEN_PATTERN.lastIndex = 0;
      let tokenMatch: RegExpExecArray | null;
      while ((tokenMatch = PLACEHOLDER_TOKEN_PATTERN.exec(text)) !== null) {
        const token = tokenMatch[0];
        if (!this.entryMap.has(token)) {
          diffAccumulator.recordUnknown(token);
        }
      }
    }

    if (!this.replaceRegex) {
      return [];
    }

    const spans: TextSpanReplacement[] = [];
    this.replaceRegex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = this.replaceRegex.exec(text)) !== null) {
      const matchedPlaceholder = match[0];
      const entry = this.entryMap.get(matchedPlaceholder);
      if (!entry) {
        continue;
      }
      diffAccumulator?.recordReplaced(matchedPlaceholder);
      spans.push({
        start: match.index,
        end: match.index + matchedPlaceholder.length,
        replacement: entry.originalValue,
      });
    }

    return spans;
  }

  /**
   * Restores a single text chunk and optionally records stats into a shared DiffAccumulator.
   */
  restoreChunk(
    text: string,
    diffAccumulator?: ReturnType<typeof createDiffAccumulator>,
  ): string {
    if (!text) {
      return text;
    }

    // 1. Scan for unknown placeholder tokens on the pre-restoration input
    if (diffAccumulator) {
      PLACEHOLDER_TOKEN_PATTERN.lastIndex = 0;
      let tokenMatch: RegExpExecArray | null;
      while ((tokenMatch = PLACEHOLDER_TOKEN_PATTERN.exec(text)) !== null) {
        const token = tokenMatch[0];
        if (!this.entryMap.has(token)) {
          diffAccumulator.recordUnknown(token);
        }
      }
    }

    if (!this.replaceRegex) {
      return text;
    }

    // 2. Single-pass length-descending replacement
    this.replaceRegex.lastIndex = 0;
    return text.replace(this.replaceRegex, (matchedPlaceholder) => {
      const entry = this.entryMap.get(matchedPlaceholder);
      if (!entry) {
        return matchedPlaceholder;
      }
      diffAccumulator?.recordReplaced(matchedPlaceholder);
      return entry.originalValue;
    });
  }

  /**
   * Convenience one-shot restoration returning restored text and full verification diff.
   */
  restoreWithDiff(text: string): {
    restoredText: string;
    diff: RestoreVerificationDiff;
  } {
    const accumulator = createDiffAccumulator(
      Array.from(this.entryMap.values()),
    );
    const restoredText = this.restoreChunk(text, accumulator);
    return {
      restoredText,
      diff: accumulator.finalize(),
    };
  }
}

export function restorePlaceholders(
  text: string,
  entries: readonly MappingEntry[],
): { restoredText: string; diff: RestoreVerificationDiff } {
  const restorer = new PlaceholderRestorer(entries);
  return restorer.restoreWithDiff(text);
}
