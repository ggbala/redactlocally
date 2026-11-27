import { loadBuiltInRules } from '../../config/rules/rule-loader';
import type { SanitizationEngine } from '../core/engine';
import type { DetectedEntity, RuleConfig } from '../core/types';
import { getFileExtension } from '../handlers/utils';
import { extractReadableSegments } from './extractors';
import type {
  DirectoryFileInput,
  DirectoryScanOptions,
  DirectoryScanReport,
  ScanFinding,
  ScannedFileSummary,
} from './types';

export const DEFAULT_IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-offline',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  'test-results',
  'playwright-report',
  '.idea',
  '.vscode',
]);

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function maskFindingValue(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= 4) {
    return '••••';
  }
  if (singleLine.includes('@') && !singleLine.includes('://')) {
    const [local, domain] = singleLine.split('@');
    const localPrefix = local.slice(0, Math.min(2, local.length));
    return `${localPrefix}***@${domain}`;
  }
  const head = singleLine.slice(0, 3);
  const tail = singleLine.slice(-2);
  return `${head}•••${tail}`;
}

function buildContextSnippets(
  text: string,
  allEntities: readonly DetectedEntity[],
  targetEntity: DetectedEntity,
): { maskedSnippet: string; rawSnippet: string } {
  const radius = 36;
  const sliceStart = Math.max(0, targetEntity.start - radius);
  const sliceEnd = Math.min(text.length, targetEntity.end + radius);
  const leadingEllipsis = sliceStart > 0 ? '…' : '';
  const trailingEllipsis = sliceEnd < text.length ? '…' : '';

  const rawSlice = text.slice(sliceStart, sliceEnd).replace(/\r?\n/g, ' ↵ ');
  const rawSnippet = `${leadingEllipsis}${rawSlice}${trailingEllipsis}`;

  // Mask EVERY detected sensitive entity overlapping the snippet window so adjacent secrets never leak
  let maskedSlice = '';
  let cursor = sliceStart;

  for (const entity of allEntities) {
    if (entity.end <= sliceStart || entity.start >= sliceEnd) {
      continue;
    }
    const clampedStart = Math.max(sliceStart, entity.start);
    const clampedEnd = Math.min(sliceEnd, entity.end);
    if (clampedStart > cursor) {
      maskedSlice += text.slice(cursor, clampedStart);
    }
    maskedSlice += maskFindingValue(entity.rawValue);
    cursor = Math.max(cursor, clampedEnd);
  }

  if (cursor < sliceEnd) {
    maskedSlice += text.slice(cursor, sliceEnd);
  }

  const maskedSnippet = `${leadingEllipsis}${maskedSlice.replace(/\r?\n/g, ' ↵ ')}${trailingEllipsis}`;
  return { maskedSnippet, rawSnippet };
}

function findIgnoredDirSegment(relativePath: string): string | null {
  const segments = relativePath.split('/').filter(Boolean);
  // Check directory segments (exclude the final filename segment)
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (DEFAULT_IGNORED_DIRECTORIES.has(seg)) {
      return seg;
    }
  }
  return null;
}

function extractRootFolderName(inputs: readonly DirectoryFileInput[]): string {
  if (inputs.length === 0) {
    return 'Selected Folder';
  }
  const firstPath = inputs[0].relativePath;
  const slashIdx = firstPath.indexOf('/');
  if (slashIdx > 0) {
    return firstPath.slice(0, slashIdx);
  }
  return 'Selected Folder';
}

/**
 * Normalizes a browser FileList (from <input webkitdirectory>) into DirectoryFileInput[].
 */
export function normalizeFileList(files: FileList | readonly File[]): DirectoryFileInput[] {
  const list = Array.from(files);
  return list
    .map((file) => {
      const webkitPath =
        'webkitRelativePath' in file && typeof file.webkitRelativePath === 'string'
          ? file.webkitRelativePath
          : '';
      return {
        file,
        relativePath: webkitPath || file.name,
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Pure read-only local directory scanner.
 * Detects sensitive entities across a folder tree using the shared SanitizationEngine
 * without modifying any file or persisting mappings.
 */
export class DirectoryScanner {
  private readonly engine: SanitizationEngine;
  private readonly ruleLabelMap: Map<string, string>;

  constructor(
    engine: SanitizationEngine,
    builtInRules: readonly RuleConfig[] = loadBuiltInRules(),
  ) {
    this.engine = engine;
    this.ruleLabelMap = new Map(builtInRules.map((r) => [r.id, r.label]));
  }

  private resolveRuleLabel(
    entity: DetectedEntity,
    options?: DirectoryScanOptions,
  ): string {
    const builtIn = this.ruleLabelMap.get(entity.ruleId);
    if (builtIn) {
      return builtIn;
    }
    const custom = options?.customRules?.find((r) => r.id === entity.ruleId);
    if (custom) {
      return custom.label;
    }
    return entity.ruleId;
  }

  async scanFiles(
    inputs: readonly DirectoryFileInput[],
    options?: DirectoryScanOptions,
  ): Promise<DirectoryScanReport> {
    const startTime = performance.now();
    const ignoreDefaultDirs = options?.ignoreDefaultDirs !== false;
    const maxFileSizeBytes =
      options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
    const rootFolderName = extractRootFolderName(inputs);

    const files: ScannedFileSummary[] = [];
    const categoryCounts: Record<string, number> = {};
    const ruleCounts: Record<string, number> = {};

    let scannedFilesCount = 0;
    let cleanFilesCount = 0;
    let filesWithFindingsCount = 0;
    let skippedFilesCount = 0;
    let errorFilesCount = 0;
    let totalFindings = 0;
    let cancelled = false;
    let findingCounter = 0;

    for (let i = 0; i < inputs.length; i++) {
      if (options?.signal?.aborted) {
        cancelled = true;
        break;
      }

      const { file, relativePath } = inputs[i];
      const fileExt = getFileExtension(file.name);

      options?.onProgress?.({
        processed: i,
        total: inputs.length,
        currentFile: relativePath,
      });

      // 1. Check ignored directories (e.g. node_modules, .git, dist)
      if (ignoreDefaultDirs) {
        const ignoredDir = findIgnoredDirSegment(relativePath);
        if (ignoredDir) {
          skippedFilesCount += 1;
          files.push({
            filePath: relativePath,
            fileName: file.name,
            fileExt,
            sizeBytes: file.size,
            status: 'skipped',
            skipReason: `Ignored directory (${ignoredDir})`,
            findings: [],
          });
          continue;
        }
      }

      // 2. Skip hidden OS metadata files
      if (file.name === '.DS_Store' || file.name === 'Thumbs.db') {
        skippedFilesCount += 1;
        files.push({
          filePath: relativePath,
          fileName: file.name,
          fileExt,
          sizeBytes: file.size,
          status: 'skipped',
          skipReason: 'OS metadata file',
          findings: [],
        });
        continue;
      }

      // 3. Enforce per-file size safeguard
      if (file.size > maxFileSizeBytes) {
        skippedFilesCount += 1;
        const limitMB = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);
        files.push({
          filePath: relativePath,
          fileName: file.name,
          fileExt,
          sizeBytes: file.size,
          status: 'skipped',
          skipReason: `File exceeds ${limitMB} MB scan limit`,
          findings: [],
        });
        continue;
      }

      // 4. Read-only text extraction & detection
      try {
        const extracted = await extractReadableSegments(file);
        if (extracted.kind === 'skipped') {
          skippedFilesCount += 1;
          files.push({
            filePath: relativePath,
            fileName: file.name,
            fileExt,
            sizeBytes: file.size,
            status: 'skipped',
            skipReason: extracted.reason,
            findings: [],
          });
          continue;
        }

        scannedFilesCount += 1;
        const fileFindings: ScanFinding[] = [];

        for (const segment of extracted.segments) {
          if (options?.signal?.aborted) {
            cancelled = true;
            break;
          }

          const entities = await this.engine.detect(segment.text, {
            enabledRuleIds: options?.enabledRuleIds,
            customRules: options?.customRules,
            fileName: file.name,
            fileExt,
          });

          for (const entity of entities) {
            findingCounter += 1;
            const maskedValue = maskFindingValue(entity.rawValue);
            const { maskedSnippet, rawSnippet } = buildContextSnippets(
              segment.text,
              entities,
              entity,
            );
            const ruleLabel = this.resolveRuleLabel(entity, options);

            fileFindings.push({
              id: `finding_${findingCounter}`,
              filePath: relativePath,
              location: segment.location,
              lineNumber: segment.lineNumber,
              ruleId: entity.ruleId,
              ruleLabel,
              category: entity.category,
              placeholderPrefix: entity.placeholderPrefix,
              rawValue: entity.rawValue,
              maskedValue,
              maskedSnippet,
              rawSnippet,
            });

            totalFindings += 1;
            categoryCounts[entity.category] =
              (categoryCounts[entity.category] ?? 0) + 1;
            ruleCounts[entity.ruleId] = (ruleCounts[entity.ruleId] ?? 0) + 1;
          }
        }

        if (cancelled) {
          break;
        }

        if (fileFindings.length > 0) {
          filesWithFindingsCount += 1;
          files.push({
            filePath: relativePath,
            fileName: file.name,
            fileExt,
            sizeBytes: file.size,
            status: 'findings',
            findings: fileFindings,
          });
        } else {
          cleanFilesCount += 1;
          files.push({
            filePath: relativePath,
            fileName: file.name,
            fileExt,
            sizeBytes: file.size,
            status: 'clean',
            findings: [],
          });
        }
      } catch (err) {
        errorFilesCount += 1;
        files.push({
          filePath: relativePath,
          fileName: file.name,
          fileExt,
          sizeBytes: file.size,
          status: 'error',
          errorMessage:
            err instanceof Error ? err.message : 'Unable to read file',
          findings: [],
        });
      }
    }

    options?.onProgress?.({
      processed: cancelled ? scannedFilesCount + skippedFilesCount + errorFilesCount : inputs.length,
      total: inputs.length,
      currentFile: '',
    });

    // Sort files so files with findings appear first (by descending finding count), then errors, clean, skipped
    const statusWeight: Record<ScannedFileSummary['status'], number> = {
      findings: 0,
      error: 1,
      clean: 2,
      skipped: 3,
    };

    files.sort((a, b) => {
      const wDiff = statusWeight[a.status] - statusWeight[b.status];
      if (wDiff !== 0) return wDiff;
      if (a.status === 'findings' && b.status === 'findings') {
        const countDiff = b.findings.length - a.findings.length;
        if (countDiff !== 0) return countDiff;
      }
      return a.filePath.localeCompare(b.filePath);
    });

    return {
      rootFolderName,
      scannedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - startTime),
      cancelled,
      totalFilesDiscovered: inputs.length,
      scannedFilesCount,
      cleanFilesCount,
      filesWithFindingsCount,
      skippedFilesCount,
      errorFilesCount,
      totalFindings,
      categoryCounts,
      ruleCounts,
      files,
    };
  }
}

/**
 * Builds a privacy-safe JSON audit summary (all sensitive values remain masked by default).
 */
export function serializeAuditReportJson(report: DirectoryScanReport): string {
  const safeReport = {
    _note:
      'Read-only local directory audit report generated by RedactLocally. Sensitive values are masked for safety.',
    rootFolderName: report.rootFolderName,
    scannedAt: report.scannedAt,
    durationMs: report.durationMs,
    summary: {
      totalFilesDiscovered: report.totalFilesDiscovered,
      scannedFilesCount: report.scannedFilesCount,
      filesWithFindingsCount: report.filesWithFindingsCount,
      cleanFilesCount: report.cleanFilesCount,
      skippedFilesCount: report.skippedFilesCount,
      totalFindings: report.totalFindings,
      categoryCounts: report.categoryCounts,
    },
    flaggedFiles: report.files
      .filter((f) => f.status === 'findings')
      .map((f) => ({
        filePath: f.filePath,
        findingCount: f.findings.length,
        findings: f.findings.map((item) => ({
          location: item.location,
          ruleId: item.ruleId,
          ruleLabel: item.ruleLabel,
          category: item.category,
          maskedValue: item.maskedValue,
          excerpt: item.maskedSnippet,
        })),
      })),
  };

  return JSON.stringify(safeReport, null, 2);
}
