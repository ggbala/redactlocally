export type BuiltInRuleCategory = 'pii' | 'financial' | 'secrets' | 'network';

export type RuleCategory = BuiltInRuleCategory | 'custom';

export type EntityCategory = RuleCategory | 'slm_ner';

export type ValidatorId = 'luhn' | 'iban' | 'ssn';

export interface RuleConfig {
  id: string;
  category: BuiltInRuleCategory;
  label: string;
  description?: string;
  placeholderPrefix: string;
  pattern: string;
  flags: string;
  priority: number;
  validator: ValidatorId | null;
  enabledByDefault: boolean;
  sampleMatch: string;
  /**
   * Optional 1-based capture group index to redact instead of the entire match.
   * Useful for contextual rules (e.g. key=value secrets or labeled IDs) so keys stay intact.
   */
  captureGroup?: number;
}

export interface CustomRule {
  id: string;
  label: string;
  mode: 'exact' | 'regex';
  pattern: string;
  placeholderPrefix?: string;
  caseSensitive?: boolean;
  enabled: boolean;
  priority?: number;
}

export interface DetectedEntity {
  start: number;
  end: number;
  rawValue: string;
  ruleId: string;
  category: EntityCategory;
  placeholderPrefix: string;
  priority: number;
  /** Reserved confidence score (0..1) for future local SLM NER / remote API detectors. */
  confidence?: number;
}

export interface DetectionContext {
  enabledRuleIds?: ReadonlySet<string>;
  customRules?: readonly CustomRule[];
  fileName?: string;
  fileExt?: string;
}

export interface DetectorProvider {
  readonly id: string;
  readonly kind: 'regex' | 'custom' | 'local_slm' | 'remote_api';
  isReady(): boolean;
  /** Reserved async initializer (e.g. downloading/warming up a local ONNX/WebGPU model). */
  init?(onProgress?: (pct: number) => void): Promise<void>;
  detect(
    text: string,
    context?: DetectionContext,
  ): Promise<DetectedEntity[]> | DetectedEntity[];
}

export interface MappingEntry {
  placeholder: string;
  originalValue: string;
  ruleId: string;
  category: string;
  count: number;
}

export type MappingRecordSource = 'indexeddb' | 'imported_json';

export interface MappingRecord {
  id: string;
  schemaVersion: '1.0';
  sourceFileName: string;
  sanitizedFileName: string;
  fileExt: string;
  createdAt: string;
  entryCount: number;
  source: MappingRecordSource;
  entries: MappingEntry[];
}

export interface SanitizeTextResult {
  sanitizedText: string;
  entries: MappingEntry[];
  totalReplacements: number;
  categoryCounts: Record<string, number>;
  ruleCounts: Record<string, number>;
}

export interface ReplacedItemDiff {
  placeholder: string;
  originalValue: string;
  ruleId: string;
  category: string;
  replacedCount: number;
  expectedCount: number;
}

export interface UnmatchedEntryDiff {
  placeholder: string;
  originalValue: string;
  ruleId: string;
  category: string;
  expectedCount: number;
}

export interface UnknownPlaceholderDiff {
  placeholder: string;
  occurrences: number;
}

export interface RestoreVerificationDiff {
  replacedCount: number;
  replacedUniqueCount: number;
  unmatchedCount: number;
  unknownCount: number;
  unknownUniqueCount: number;
  replaced: ReplacedItemDiff[];
  unmatchedFromMap: UnmatchedEntryDiff[];
  unknownInFile: UnknownPlaceholderDiff[];
}

export interface RestoreTextResult {
  restoredText: string;
  diff: RestoreVerificationDiff;
}
