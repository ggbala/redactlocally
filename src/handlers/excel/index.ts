import type { SanitizationEngine } from '../../core/engine';
import type { MappingRecord } from '../../core/types';
import type {
  DocumentHandler,
  DocumentRestoreResult,
  DocumentSanitizeResult,
  RestoreOptions,
  SanitizeOptions,
} from '../types';
import { getFileExtension } from '../utils';
import { restoreCsvFile, sanitizeCsvFile } from './csv-handler';
import { restoreXlsxFile, sanitizeXlsxFile } from './xlsx-handler';

export class ExcelDocumentHandler implements DocumentHandler {
  readonly id = 'excel';
  readonly displayName = 'Excel & CSV Spreadsheets';
  readonly supportedExtensions = ['.xlsx', '.xls', '.csv'];
  readonly supported = true;

  async sanitize(
    file: File,
    engine: SanitizationEngine,
    options?: SanitizeOptions,
  ): Promise<DocumentSanitizeResult> {
    const ext = getFileExtension(file.name);
    if (ext === '.csv') {
      return sanitizeCsvFile(file, engine, options);
    }
    return sanitizeXlsxFile(file, engine, options);
  }

  async restore(
    file: File,
    map: MappingRecord,
    options?: RestoreOptions,
  ): Promise<DocumentRestoreResult> {
    const ext = getFileExtension(file.name);
    if (ext === '.csv') {
      return restoreCsvFile(file, map, options);
    }
    return restoreXlsxFile(file, map, options);
  }
}
