import type {
  CustomRule,
  MappingRecord,
  RestoreVerificationDiff,
} from '../core/types';
import type { SanitizationEngine } from '../core/engine';

export interface SanitizeOptions {
  enabledRuleIds?: ReadonlySet<string>;
  customRules?: readonly CustomRule[];
  /** Strip document metadata (Author / Company / Last Modified By) when supported (e.g. .docx, .xlsx). */
  stripMetadata?: boolean;
}

export interface RestoreOptions {
  /** Reserved for future format-specific restoration controls. */
  preserveFormatting?: boolean;
}

export interface DocumentSanitizeResult {
  blob: Blob;
  sanitizedFileName: string;
  mapping: MappingRecord;
  totalReplacements: number;
  categoryCounts: Record<string, number>;
  metadataStripped?: boolean;
  warnings?: string[];
}

export interface DocumentRestoreResult {
  blob: Blob;
  restoredFileName: string;
  diff: RestoreVerificationDiff;
  warnings?: string[];
}

export interface DocumentHandler {
  readonly id: string;
  readonly displayName: string;
  readonly supportedExtensions: string[];
  readonly supported: boolean;
  sanitize(
    file: File,
    engine: SanitizationEngine,
    options?: SanitizeOptions,
  ): Promise<DocumentSanitizeResult>;
  restore(
    file: File,
    map: MappingRecord,
    options?: RestoreOptions,
  ): Promise<DocumentRestoreResult>;
}
