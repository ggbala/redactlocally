import type {
  DetectionContext,
  MappingEntry,
  MappingRecord,
} from '../core/types';
import type { SanitizeOptions } from './types';

export type DocumentErrorCode =
  | 'PDF_UNSUPPORTED_V1'
  | 'UNSUPPORTED_FORMAT'
  | 'LEGACY_XLS_UNSUPPORTED'
  | 'CORRUPT_DOCUMENT';

export class UnsupportedDocumentFormatError extends Error {
  readonly code: DocumentErrorCode;

  constructor(code: DocumentErrorCode, message: string) {
    super(message);
    this.name = 'UnsupportedDocumentFormatError';
    this.code = code;
  }
}

/**
 * Extracts normalized lowercase file extension including leading dot (e.g. ".xlsx", ".env").
 */
export function getFileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const lastDot = base.lastIndexOf('.');
  if (lastDot < 0) {
    return '';
  }
  return base.slice(lastDot).toLowerCase();
}

export function buildSanitizedFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const lastDot = base.lastIndexOf('.');
  if (lastDot === 0) {
    return `sanitized${base}`;
  }
  if (lastDot > 0) {
    return `${base.slice(0, lastDot)}_sanitized${base.slice(lastDot)}`;
  }
  return `${base}_sanitized`;
}

export function buildRestoredFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const lastDot = base.lastIndexOf('.');
  if (lastDot === 0) {
    return `restored${base}`;
  }
  if (lastDot > 0) {
    const stem = base.slice(0, lastDot).replace(/_sanitized$/i, '');
    return `${stem}_restored${base.slice(lastDot)}`;
  }
  const stem = base.replace(/_sanitized$/i, '');
  return `${stem}_restored`;
}

/**
 * Generates a RFC 4122 v4 UUID, safe across HTTPS, localhost, and offline file:// origins.
 */
export function generateUuid(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Reads a File/Blob into an ArrayBuffer with FileReader fallback for older/jsdom environments.
 */
export async function readFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as ArrayBuffer.'));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

export async function readFileAsText(file: Blob): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file);
  return new TextDecoder('utf-8').decode(buffer);
}

export function buildDetectionContext(
  fileName: string,
  options?: SanitizeOptions,
): DetectionContext {
  return {
    enabledRuleIds: options?.enabledRuleIds,
    customRules: options?.customRules,
    fileName,
    fileExt: getFileExtension(fileName),
  };
}

export function buildMappingRecord(params: {
  sourceFileName: string;
  sanitizedFileName: string;
  entries: MappingEntry[];
}): MappingRecord {
  return {
    id: generateUuid(),
    schemaVersion: '1.0',
    sourceFileName: params.sourceFileName,
    sanitizedFileName: params.sanitizedFileName,
    fileExt: getFileExtension(params.sourceFileName) || '.txt',
    createdAt: new Date().toISOString(),
    entryCount: params.entries.length,
    source: 'indexeddb',
    entries: params.entries.map((e) => ({ ...e })),
  };
}
