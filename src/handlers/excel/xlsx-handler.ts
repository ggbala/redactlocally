import ExcelJS from 'exceljs';
import type { SanitizationEngine } from '../../core/engine';
import type { MappingRecord } from '../../core/types';
import type { TextSpanReplacement } from '../../core/placeholder';
import type {
  DocumentRestoreResult,
  DocumentSanitizeResult,
  RestoreOptions,
  SanitizeOptions,
} from '../types';
import {
  UnsupportedDocumentFormatError,
  buildDetectionContext,
  buildMappingRecord,
  buildRestoredFileName,
  buildSanitizedFileName,
  getFileExtension,
  readFileAsArrayBuffer,
} from '../utils';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface RichTextRun {
  text: string;
  font?: Partial<ExcelJS.Font>;
}

interface RichTextValue {
  richText: RichTextRun[];
}

interface HyperlinkValue {
  text: string;
  hyperlink: string;
  tooltip?: string;
}

interface FormulaValue {
  formula?: string;
  sharedFormula?: string;
  result?: unknown;
}

function isRichTextValue(value: unknown): value is RichTextValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'richText' in value &&
    Array.isArray((value as RichTextValue).richText)
  );
}

function isHyperlinkValue(value: unknown): value is HyperlinkValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'hyperlink' in value &&
    'text' in value &&
    typeof (value as HyperlinkValue).hyperlink === 'string'
  );
}

function isFormulaValue(value: unknown): value is FormulaValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('formula' in value || 'sharedFormula' in value)
  );
}

/**
 * Applies span replacements across RichText runs while preserving each run's font styling.
 */
function applySpansToRichText(
  runs: readonly RichTextRun[],
  spans: readonly TextSpanReplacement[],
): RichTextRun[] {
  if (spans.length === 0) {
    return runs.map((r) => ({ ...r }));
  }

  const mutable = runs.map((r) => ({ ...r }));
  const segments: Array<{ idx: number; start: number; end: number }> = [];
  let offset = 0;

  for (let i = 0; i < mutable.length; i++) {
    const len = mutable[i].text.length;
    segments.push({ idx: i, start: offset, end: offset + len });
    offset += len;
  }

  for (let s = spans.length - 1; s >= 0; s--) {
    const { start: repStart, end: repEnd, replacement } = spans[s];
    const overlapping = segments.filter(
      (seg) => seg.start < repEnd && repStart < seg.end,
    );
    if (overlapping.length === 0) {
      continue;
    }

    const first = overlapping[0];
    const last = overlapping[overlapping.length - 1];

    if (first.idx === last.idx) {
      const text = mutable[first.idx].text;
      const localStart = repStart - first.start;
      const localEnd = repEnd - first.start;
      mutable[first.idx].text =
        text.slice(0, localStart) + replacement + text.slice(localEnd);
    } else {
      const firstText = mutable[first.idx].text;
      const lastText = mutable[last.idx].text;
      const localStart = repStart - first.start;
      const localEnd = repEnd - last.start;

      mutable[first.idx].text = firstText.slice(0, localStart) + replacement;
      for (let k = 1; k < overlapping.length - 1; k++) {
        mutable[overlapping[k].idx].text = '';
      }
      mutable[last.idx].text = lastText.slice(localEnd);
    }
  }

  return mutable;
}

async function loadWorkbookOrThrow(file: File): Promise<ExcelJS.Workbook> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = new ExcelJS.Workbook();
  const ext = getFileExtension(file.name);

  try {
    await workbook.xlsx.load(buffer);
    return workbook;
  } catch (err) {
    if (ext === '.xls') {
      throw new UnsupportedDocumentFormatError(
        'LEGACY_XLS_UNSUPPORTED',
        'Legacy binary .xls files cannot be parsed offline yet. Please re-save the workbook as .xlsx or .csv and upload again.',
      );
    }
    throw new UnsupportedDocumentFormatError(
      'CORRUPT_DOCUMENT',
      `Unable to parse Excel file "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function stripWorkbookMetadata(workbook: ExcelJS.Workbook): void {
  workbook.creator = '';
  workbook.lastModifiedBy = '';
  workbook.company = '';
  workbook.manager = '';
  workbook.title = '';
  workbook.subject = '';
  workbook.keywords = '';
  workbook.description = '';
}

export async function sanitizeXlsxFile(
  file: File,
  engine: SanitizationEngine,
  options?: SanitizeOptions,
): Promise<DocumentSanitizeResult> {
  const workbook = await loadWorkbookOrThrow(file);
  const context = buildDetectionContext(file.name, options);
  const session = engine.createSession(context);

  // Pass 0: pre-scan all text cells across all worksheets to avoid literal placeholder collisions
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        if (typeof val === 'string') {
          session.reserveExistingPlaceholders(val);
        } else if (isRichTextValue(val)) {
          session.reserveExistingPlaceholders(
            val.richText.map((r) => r.text).join(''),
          );
        } else if (isHyperlinkValue(val)) {
          session.reserveExistingPlaceholders(val.text);
          session.reserveExistingPlaceholders(val.hyperlink);
        } else if (isFormulaValue(val) && typeof val.result === 'string') {
          session.reserveExistingPlaceholders(val.result);
        }
      });
    });
  });

  // Pass 1: sanitize cell values while strictly preserving formulas, column widths, and styles
  const cellsToProcess: ExcelJS.Cell[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cellsToProcess.push(cell);
      });
    });
  });

  for (const cell of cellsToProcess) {
    const val = cell.value;

    // Never overwrite formula definitions (e.g. =SUM(C2:C5))!
    if (isFormulaValue(val)) {
      if (typeof val.result === 'string' && val.result.length > 0) {
        const sanitizedResult = await session.sanitizeChunk(val.result);
        if (sanitizedResult !== val.result) {
          cell.value = {
            ...val,
            result: sanitizedResult,
          } as ExcelJS.CellValue;
        }
      }
      continue;
    }

    if (typeof val === 'string') {
      const sanitized = await session.sanitizeChunk(val);
      if (sanitized !== val) {
        cell.value = sanitized;
      }
      continue;
    }

    if (isRichTextValue(val)) {
      const fullText = val.richText.map((r) => r.text).join('');
      const spans = await session.getChunkReplacements(fullText);
      if (spans.length > 0) {
        cell.value = {
          richText: applySpansToRichText(val.richText, spans),
        };
      }
      continue;
    }

    if (isHyperlinkValue(val)) {
      const sanitizedText = await session.sanitizeChunk(val.text);
      const sanitizedHref = await session.sanitizeChunk(val.hyperlink);
      if (sanitizedText !== val.text || sanitizedHref !== val.hyperlink) {
        cell.value = {
          ...val,
          text: sanitizedText,
          hyperlink: sanitizedHref,
        };
      }
    }
  }

  const shouldStripMetadata = options?.stripMetadata !== false;
  if (shouldStripMetadata) {
    stripWorkbookMetadata(workbook);
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: XLSX_MIME });
  const sanitizedFileName = buildSanitizedFileName(file.name);
  const summary = session.getSummary();

  return {
    blob,
    sanitizedFileName,
    mapping: buildMappingRecord({
      sourceFileName: file.name,
      sanitizedFileName,
      entries: summary.entries,
    }),
    totalReplacements: summary.totalReplacements,
    categoryCounts: summary.categoryCounts,
    metadataStripped: shouldStripMetadata,
  };
}

export async function restoreXlsxFile(
  file: File,
  map: MappingRecord,
  _options?: RestoreOptions,
): Promise<DocumentRestoreResult> {
  const workbook = await loadWorkbookOrThrow(file);
  const restoreSession = engineRestoreHelper(map);

  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;

        if (isFormulaValue(val)) {
          if (typeof val.result === 'string' && val.result.length > 0) {
            const restoredResult = restoreSession.restoreChunk(val.result);
            if (restoredResult !== val.result) {
              cell.value = {
                ...val,
                result: restoredResult,
              } as ExcelJS.CellValue;
            }
          }
          return;
        }

        if (typeof val === 'string') {
          const restored = restoreSession.restoreChunk(val);
          if (restored !== val) {
            cell.value = restored;
          }
          return;
        }

        if (isRichTextValue(val)) {
          const fullText = val.richText.map((r) => r.text).join('');
          const spans = restoreSession.getChunkRestoreSpans(fullText);
          if (spans.length > 0) {
            cell.value = {
              richText: applySpansToRichText(val.richText, spans),
            };
          }
          return;
        }

        if (isHyperlinkValue(val)) {
          const restoredText = restoreSession.restoreChunk(val.text);
          const restoredHref = restoreSession.restoreChunk(val.hyperlink);
          if (restoredText !== val.text || restoredHref !== val.hyperlink) {
            cell.value = {
              ...val,
              text: restoredText,
              hyperlink: restoredHref,
            };
          }
        }
      });
    });
  });

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: XLSX_MIME });

  return {
    blob,
    restoredFileName: buildRestoredFileName(file.name),
    diff: restoreSession.finalizeDiff(),
  };
}

import { PlaceholderRestorer } from '../../core/placeholder';
import { createDiffAccumulator } from '../../core/diff';

function engineRestoreHelper(map: MappingRecord) {
  const restorer = new PlaceholderRestorer(map.entries);
  const accumulator = createDiffAccumulator(map.entries);
  return {
    restoreChunk: (text: string) => restorer.restoreChunk(text, accumulator),
    getChunkRestoreSpans: (text: string) =>
      restorer.getRestoreSpans(text, accumulator),
    finalizeDiff: () => accumulator.finalize(),
  };
}
