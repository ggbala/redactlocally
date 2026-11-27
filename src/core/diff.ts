import type {
  MappingEntry,
  ReplacedItemDiff,
  RestoreVerificationDiff,
  UnknownPlaceholderDiff,
  UnmatchedEntryDiff,
} from './types';

export interface DiffAccumulator {
  recordReplaced(placeholder: string): void;
  recordUnknown(placeholder: string): void;
  finalize(): RestoreVerificationDiff;
}

/**
 * Accumulates restoration verification statistics across a single text
 * or an entire multi-sheet/multi-paragraph document:
 * 1. replaced: map placeholders successfully matched and restored
 * 2. unmatchedFromMap: map placeholders missing from the AI output
 * 3. unknownInFile: placeholder-shaped tokens in AI output not found in the active map
 */
export function createDiffAccumulator(
  entries: readonly MappingEntry[],
): DiffAccumulator {
  const replacedCounts = new Map<string, number>();
  const unknownCounts = new Map<string, number>();

  return {
    recordReplaced(placeholder: string): void {
      replacedCounts.set(placeholder, (replacedCounts.get(placeholder) ?? 0) + 1);
    },

    recordUnknown(placeholder: string): void {
      unknownCounts.set(placeholder, (unknownCounts.get(placeholder) ?? 0) + 1);
    },

    finalize(): RestoreVerificationDiff {
      const replaced: ReplacedItemDiff[] = [];
      const unmatchedFromMap: UnmatchedEntryDiff[] = [];
      let replacedCount = 0;

      for (const entry of entries) {
        const count = replacedCounts.get(entry.placeholder) ?? 0;
        if (count > 0) {
          replacedCount += count;
          replaced.push({
            placeholder: entry.placeholder,
            originalValue: entry.originalValue,
            ruleId: entry.ruleId,
            category: entry.category,
            replacedCount: count,
            expectedCount: entry.count,
          });
        } else {
          unmatchedFromMap.push({
            placeholder: entry.placeholder,
            originalValue: entry.originalValue,
            ruleId: entry.ruleId,
            category: entry.category,
            expectedCount: entry.count,
          });
        }
      }

      const unknownInFile: UnknownPlaceholderDiff[] = [];
      let unknownCount = 0;

      for (const [placeholder, occurrences] of unknownCounts.entries()) {
        unknownCount += occurrences;
        unknownInFile.push({ placeholder, occurrences });
      }

      return {
        replacedCount,
        replacedUniqueCount: replaced.length,
        unmatchedCount: unmatchedFromMap.length,
        unknownCount,
        unknownUniqueCount: unknownInFile.length,
        replaced,
        unmatchedFromMap,
        unknownInFile,
      };
    },
  };
}
