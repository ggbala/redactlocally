import type {
  DetectedEntity,
  DetectionContext,
  DetectorProvider,
  MappingEntry,
  RestoreTextResult,
  RuleConfig,
  SanitizeTextResult,
} from './types';
import {
  PlaceholderAllocator,
  PlaceholderRestorer,
  applyEntityReplacements,
  buildEntitySpanReplacements,
  resolveOverlaps,
  restorePlaceholders,
  type TextSpanReplacement,
} from './placeholder';
import { createDiffAccumulator, type DiffAccumulator } from './diff';
import { loadBuiltInRules } from '../../config/rules/rule-loader';
import { RegexDetector } from '../detectors/regex-detector';
import { CustomDetector } from '../detectors/custom-detector';

export interface SanitizationSession {
  /** Pre-scan source chunks so literal placeholders like [EMAIL_1] are never collided with. */
  reserveExistingPlaceholders(text: string): void;
  /** Sanitize a text chunk while preserving consistent placeholder mappings across chunks. */
  sanitizeChunk(text: string): Promise<string>;
  /** Synchronous chunk sanitization when all active detectors are synchronous (V1 default). */
  sanitizeChunkSync(text: string): string;
  /** Returns exact span replacements for format-preserving XML/RichText run editing. */
  getChunkReplacements(text: string): Promise<TextSpanReplacement[]>;
  getEntries(): MappingEntry[];
  getSummary(): {
    entries: MappingEntry[];
    totalReplacements: number;
    categoryCounts: Record<string, number>;
    ruleCounts: Record<string, number>;
  };
}

export interface RestoreSession {
  restoreChunk(text: string): string;
  getChunkRestoreSpans(text: string): TextSpanReplacement[];
  finalizeDiff(): RestoreTextResult['diff'];
}

function summarizeEntries(entries: readonly MappingEntry[]): {
  totalReplacements: number;
  categoryCounts: Record<string, number>;
  ruleCounts: Record<string, number>;
} {
  let totalReplacements = 0;
  const categoryCounts: Record<string, number> = {};
  const ruleCounts: Record<string, number> = {};

  for (const entry of entries) {
    totalReplacements += entry.count;
    categoryCounts[entry.category] =
      (categoryCounts[entry.category] ?? 0) + entry.count;
    ruleCounts[entry.ruleId] = (ruleCounts[entry.ruleId] ?? 0) + entry.count;
  }

  return { totalReplacements, categoryCounts, ruleCounts };
}

/**
 * Core pluggable sanitization and reversible restoration engine.
 * Zero DOM/UI dependencies — orchestrates multiple DetectorProviders,
 * overlap resolution, collision-free placeholder allocation, and diff-verified restoration.
 */
export class SanitizationEngine {
  private readonly detectors: DetectorProvider[];

  constructor(detectors?: DetectorProvider[]) {
    if (detectors && detectors.length > 0) {
      this.detectors = [...detectors];
    } else {
      const builtInRules = loadBuiltInRules();
      this.detectors = [new RegexDetector(builtInRules), new CustomDetector()];
    }
  }

  registerDetector(detector: DetectorProvider): void {
    this.detectors.push(detector);
  }

  getDetectors(): readonly DetectorProvider[] {
    return this.detectors;
  }

  async detect(
    text: string,
    context?: DetectionContext,
  ): Promise<DetectedEntity[]> {
    if (!text) {
      return [];
    }

    const collected: DetectedEntity[] = [];
    for (const detector of this.detectors) {
      if (!detector.isReady()) {
        continue;
      }
      const found = await detector.detect(text, context);
      if (found.length > 0) {
        collected.push(...found);
      }
    }

    return resolveOverlaps(collected);
  }

  detectSync(text: string, context?: DetectionContext): DetectedEntity[] {
    if (!text) {
      return [];
    }

    const collected: DetectedEntity[] = [];
    for (const detector of this.detectors) {
      if (!detector.isReady()) {
        continue;
      }
      const found = detector.detect(text, context);
      if (Array.isArray(found) && found.length > 0) {
        collected.push(...found);
      }
    }

    return resolveOverlaps(collected);
  }

  /**
   * Creates a stateful multi-chunk session (used by Excel/Word/CSV handlers so the same
   * entity across different sheets or paragraphs receives the exact same placeholder).
   */
  createSession(context?: DetectionContext): SanitizationSession {
    const allocator = new PlaceholderAllocator();

    return {
      reserveExistingPlaceholders: (text: string) => {
        allocator.reserveExistingPlaceholders(text);
      },

      sanitizeChunk: async (text: string): Promise<string> => {
        if (!text) {
          return text;
        }
        allocator.reserveExistingPlaceholders(text);
        const entities = await this.detect(text, context);
        return applyEntityReplacements(text, entities, allocator);
      },

      sanitizeChunkSync: (text: string): string => {
        if (!text) {
          return text;
        }
        allocator.reserveExistingPlaceholders(text);
        const entities = this.detectSync(text, context);
        return applyEntityReplacements(text, entities, allocator);
      },

      getChunkReplacements: async (
        text: string,
      ): Promise<TextSpanReplacement[]> => {
        if (!text) {
          return [];
        }
        allocator.reserveExistingPlaceholders(text);
        const entities = await this.detect(text, context);
        return buildEntitySpanReplacements(entities, allocator);
      },

      getEntries: () => allocator.getEntries(),

      getSummary: () => {
        const entries = allocator.getEntries();
        const { totalReplacements, categoryCounts, ruleCounts } =
          summarizeEntries(entries);
        return {
          entries,
          totalReplacements,
          categoryCounts,
          ruleCounts,
        };
      },
    };
  }

  /**
   * One-shot async sanitization for text/prompt inputs.
   */
  async sanitizeText(
    text: string,
    context?: DetectionContext,
  ): Promise<SanitizeTextResult> {
    const session = this.createSession(context);
    const sanitizedText = await session.sanitizeChunk(text);
    const summary = session.getSummary();
    return {
      sanitizedText,
      ...summary,
    };
  }

  /**
   * One-shot synchronous sanitization (convenient for V1 instant Text Mode).
   */
  sanitizeTextSync(
    text: string,
    context?: DetectionContext,
  ): SanitizeTextResult {
    const session = this.createSession(context);
    const sanitizedText = session.sanitizeChunkSync(text);
    const summary = session.getSummary();
    return {
      sanitizedText,
      ...summary,
    };
  }

  /**
   * Creates a stateful multi-chunk restore session (for multi-sheet/multi-paragraph documents).
   */
  createRestoreSession(entries: readonly MappingEntry[]): RestoreSession {
    const restorer = new PlaceholderRestorer(entries);
    const accumulator: DiffAccumulator = createDiffAccumulator(entries);

    return {
      restoreChunk: (text: string) => restorer.restoreChunk(text, accumulator),
      getChunkRestoreSpans: (text: string) =>
        restorer.getRestoreSpans(text, accumulator),
      finalizeDiff: () => accumulator.finalize(),
    };
  }

  /**
   * One-shot reversible restoration with full verification diff.
   */
  restoreText(
    text: string,
    entries: readonly MappingEntry[],
  ): RestoreTextResult {
    return restorePlaceholders(text, entries);
  }
}

export function createDefaultEngine(
  rules: readonly RuleConfig[] = loadBuiltInRules(),
): SanitizationEngine {
  return new SanitizationEngine([new RegexDetector(rules), new CustomDetector()]);
}
