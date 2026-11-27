import type { CustomRule, EntityCategory } from '../core/types';

export interface ScannedSegment {
  location: string;
  lineNumber?: number;
  text: string;
}

export interface ScanFinding {
  id: string;
  filePath: string;
  location: string;
  lineNumber?: number;
  ruleId: string;
  ruleLabel: string;
  category: EntityCategory;
  placeholderPrefix: string;
  rawValue: string;
  maskedValue: string;
  /** Compact excerpt with the sensitive span replaced by maskedValue (safe by default). */
  maskedSnippet: string;
  /** Compact excerpt with the original rawValue (shown only when user clicks Reveal). */
  rawSnippet: string;
}

export type ScannedFileStatus = 'findings' | 'clean' | 'skipped' | 'error';

export interface ScannedFileSummary {
  filePath: string;
  fileName: string;
  fileExt: string;
  sizeBytes: number;
  status: ScannedFileStatus;
  skipReason?: string;
  errorMessage?: string;
  findings: ScanFinding[];
}

export interface DirectoryScanProgress {
  processed: number;
  total: number;
  currentFile: string;
}

export interface DirectoryScanOptions {
  enabledRuleIds?: ReadonlySet<string>;
  customRules?: readonly CustomRule[];
  /** Skip common dependency/build directories like node_modules, .git, dist, build (default: true). */
  ignoreDefaultDirs?: boolean;
  /** Maximum per-file size in bytes to scan locally (default: 10 MB). */
  maxFileSizeBytes?: number;
  onProgress?: (progress: DirectoryScanProgress) => void;
  signal?: AbortSignal;
}

export interface DirectoryScanReport {
  rootFolderName: string;
  scannedAt: string;
  durationMs: number;
  cancelled: boolean;
  totalFilesDiscovered: number;
  scannedFilesCount: number;
  cleanFilesCount: number;
  filesWithFindingsCount: number;
  skippedFilesCount: number;
  errorFilesCount: number;
  totalFindings: number;
  categoryCounts: Record<string, number>;
  ruleCounts: Record<string, number>;
  files: ScannedFileSummary[];
}

export interface DirectoryFileInput {
  file: File;
  relativePath: string;
}
