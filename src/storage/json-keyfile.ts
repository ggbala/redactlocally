import type { MappingEntry, MappingRecord } from '../core/types';
import type { ExportedKeyFile } from './types';

export const KEYFILE_SECURITY_WARNING =
  'CONFIDENTIAL KEY FILE: Contains original sensitive values. Keep offline and NEVER upload to ChatGPT or any AI.';

const VALID_PLACEHOLDER_PATTERN = /^\[[A-Z][A-Z0-9_]*_\d+\]$/;

export class KeyFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyFileValidationError';
  }
}

export function getKeyFileName(sourceFileName: string): string {
  const lastDot = sourceFileName.lastIndexOf('.');
  const baseName =
    lastDot > 0 ? sourceFileName.slice(0, lastDot) : sourceFileName;
  return `${baseName}_key_map.json`;
}

export function buildExportedKeyFile(record: MappingRecord): ExportedKeyFile {
  return {
    _security_warning: KEYFILE_SECURITY_WARNING,
    schemaVersion: '1.0',
    id: record.id,
    sourceFileName: record.sourceFileName,
    sanitizedFileName: record.sanitizedFileName,
    fileExt: record.fileExt,
    createdAt: record.createdAt,
    entryCount: record.entries.length,
    entries: record.entries.map((entry) => ({ ...entry })),
  };
}

export function serializeKeyFile(record: MappingRecord): string {
  return JSON.stringify(buildExportedKeyFile(record), null, 2);
}

export function createKeyFileBlob(record: MappingRecord): Blob {
  return new Blob([serializeKeyFile(record)], {
    type: 'application/json;charset=utf-8',
  });
}

/**
 * Strictly parses and validates an imported .json mapping key file.
 * Rejects malformed, tampered, or incompatible schemas with a clear English error.
 */
export function parseAndValidateKeyFile(jsonText: string): MappingRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new KeyFileValidationError(
      'Invalid JSON file. Please select a valid key map (.json) exported by this tool.',
    );
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new KeyFileValidationError('Key map root must be a JSON object.');
  }

  const data = raw as Record<string, unknown>;

  if (data.schemaVersion !== '1.0') {
    throw new KeyFileValidationError(
      `Unsupported key map schemaVersion "${String(data.schemaVersion)}". Expected "1.0".`,
    );
  }

  if (typeof data.id !== 'string' || data.id.trim().length === 0) {
    throw new KeyFileValidationError('Key map is missing a valid "id".');
  }

  if (
    typeof data.sourceFileName !== 'string' ||
    data.sourceFileName.trim().length === 0
  ) {
    throw new KeyFileValidationError(
      'Key map is missing a valid "sourceFileName".',
    );
  }

  if (
    typeof data.sanitizedFileName !== 'string' ||
    data.sanitizedFileName.trim().length === 0
  ) {
    throw new KeyFileValidationError(
      'Key map is missing a valid "sanitizedFileName".',
    );
  }

  if (
    typeof data.fileExt !== 'string' ||
    !data.fileExt.startsWith('.') ||
    data.fileExt.length < 2
  ) {
    throw new KeyFileValidationError(
      'Key map is missing a valid "fileExt" (e.g. ".xlsx").',
    );
  }

  if (
    typeof data.createdAt !== 'string' ||
    Number.isNaN(Date.parse(data.createdAt))
  ) {
    throw new KeyFileValidationError(
      'Key map is missing a valid ISO 8601 "createdAt" timestamp.',
    );
  }

  if (!Array.isArray(data.entries)) {
    throw new KeyFileValidationError(
      'Key map "entries" field must be an array.',
    );
  }

  if (
    typeof data.entryCount !== 'number' ||
    !Number.isInteger(data.entryCount) ||
    data.entryCount !== data.entries.length
  ) {
    throw new KeyFileValidationError(
      'Key map "entryCount" does not match the number of entries (file may be truncated or tampered).',
    );
  }

  const seenPlaceholders = new Set<string>();
  const validatedEntries: MappingEntry[] = [];

  for (let idx = 0; idx < data.entries.length; idx++) {
    const item = data.entries[idx];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new KeyFileValidationError(
        `Entry at index ${idx} must be an object.`,
      );
    }

    const e = item as Record<string, unknown>;

    if (
      typeof e.placeholder !== 'string' ||
      !VALID_PLACEHOLDER_PATTERN.test(e.placeholder)
    ) {
      throw new KeyFileValidationError(
        `Entry at index ${idx} has invalid placeholder "${String(e.placeholder)}".`,
      );
    }

    if (seenPlaceholders.has(e.placeholder)) {
      throw new KeyFileValidationError(
        `Duplicate placeholder "${e.placeholder}" found in key map.`,
      );
    }
    seenPlaceholders.add(e.placeholder);

    if (typeof e.originalValue !== 'string' || e.originalValue.length === 0) {
      throw new KeyFileValidationError(
        `Entry "${e.placeholder}" is missing a valid "originalValue".`,
      );
    }

    if (typeof e.ruleId !== 'string' || e.ruleId.trim().length === 0) {
      throw new KeyFileValidationError(
        `Entry "${e.placeholder}" is missing a valid "ruleId".`,
      );
    }

    if (typeof e.category !== 'string' || e.category.trim().length === 0) {
      throw new KeyFileValidationError(
        `Entry "${e.placeholder}" is missing a valid "category".`,
      );
    }

    if (
      typeof e.count !== 'number' ||
      !Number.isInteger(e.count) ||
      e.count < 1
    ) {
      throw new KeyFileValidationError(
        `Entry "${e.placeholder}" has invalid "count".`,
      );
    }

    validatedEntries.push({
      placeholder: e.placeholder,
      originalValue: e.originalValue,
      ruleId: e.ruleId,
      category: e.category,
      count: e.count,
    });
  }

  return {
    id: data.id,
    schemaVersion: '1.0',
    sourceFileName: data.sourceFileName,
    sanitizedFileName: data.sanitizedFileName,
    fileExt: data.fileExt,
    createdAt: data.createdAt,
    entryCount: validatedEntries.length,
    source: 'imported_json',
    entries: validatedEntries,
  };
}
