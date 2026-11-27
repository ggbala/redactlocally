import Papa from 'papaparse';
import type { SanitizationEngine } from '../../core/engine';
import type { MappingRecord } from '../../core/types';
import { PlaceholderRestorer } from '../../core/placeholder';
import { createDiffAccumulator } from '../../core/diff';
import type {
  DocumentRestoreResult,
  DocumentSanitizeResult,
  RestoreOptions,
  SanitizeOptions,
} from '../types';
import {
  buildDetectionContext,
  buildMappingRecord,
  buildRestoredFileName,
  buildSanitizedFileName,
  readFileAsText,
} from '../utils';

export const CSV_MIME = 'text/csv;charset=utf-8';

function detectNewline(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function splitBom(text: string): { bom: string; content: string } {
  if (text.startsWith('\uFEFF')) {
    return { bom: '\uFEFF', content: text.slice(1) };
  }
  return { bom: '', content: text };
}

export async function sanitizeCsvFile(
  file: File,
  engine: SanitizationEngine,
  options?: SanitizeOptions,
): Promise<DocumentSanitizeResult> {
  const rawText = await readFileAsText(file);
  const { bom, content } = splitBom(rawText);
  const newline = detectNewline(content);
  const hasTrailingNewline = content.endsWith(newline);

  const parsed = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
  });

  const rows = parsed.data;
  const context = buildDetectionContext(file.name, options);
  const session = engine.createSession(context);

  // Pass 0: reserve literal placeholders across all CSV cells
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === 'string' && cell.length > 0) {
        session.reserveExistingPlaceholders(cell);
      }
    }
  }

  // Pass 1: sanitize each cell preserving column structure & quoted commas
  const sanitizedRows: string[][] = [];
  for (const row of rows) {
    const nextRow: string[] = [];
    for (const cell of row) {
      if (typeof cell === 'string' && cell.length > 0) {
        nextRow.push(await session.sanitizeChunk(cell));
      } else {
        nextRow.push(cell ?? '');
      }
    }
    sanitizedRows.push(nextRow);
  }

  // Papa.parse includes a trailing [""] row if the input ended with a trailing newline
  const rowsToUnparse =
    hasTrailingNewline &&
    sanitizedRows.length > 0 &&
    sanitizedRows[sanitizedRows.length - 1].length === 1 &&
    sanitizedRows[sanitizedRows.length - 1][0] === ''
      ? sanitizedRows.slice(0, -1)
      : sanitizedRows;

  let output = Papa.unparse(rowsToUnparse, {
    delimiter: parsed.meta.delimiter || ',',
    newline,
  });
  if (hasTrailingNewline) {
    output += newline;
  }

  const blob = new Blob([bom + output], { type: CSV_MIME });
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
  };
}

export async function restoreCsvFile(
  file: File,
  map: MappingRecord,
  _options?: RestoreOptions,
): Promise<DocumentRestoreResult> {
  const rawText = await readFileAsText(file);
  const { bom, content } = splitBom(rawText);
  const newline = detectNewline(content);
  const hasTrailingNewline = content.endsWith(newline);

  const parsed = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
  });

  const restorer = new PlaceholderRestorer(map.entries);
  const accumulator = createDiffAccumulator(map.entries);

  const restoredRows = parsed.data.map((row) =>
    row.map((cell) =>
      typeof cell === 'string' && cell.length > 0
        ? restorer.restoreChunk(cell, accumulator)
        : (cell ?? ''),
    ),
  );

  const rowsToUnparse =
    hasTrailingNewline &&
    restoredRows.length > 0 &&
    restoredRows[restoredRows.length - 1].length === 1 &&
    restoredRows[restoredRows.length - 1][0] === ''
      ? restoredRows.slice(0, -1)
      : restoredRows;

  let output = Papa.unparse(rowsToUnparse, {
    delimiter: parsed.meta.delimiter || ',',
    newline,
  });
  if (hasTrailingNewline) {
    output += newline;
  }

  const blob = new Blob([bom + output], { type: CSV_MIME });

  return {
    blob,
    restoredFileName: buildRestoredFileName(file.name),
    diff: accumulator.finalize(),
  };
}
