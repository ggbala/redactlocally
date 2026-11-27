import type { SanitizationEngine } from '../../core/engine';
import type { MappingRecord } from '../../core/types';
import type {
  DocumentHandler,
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
import { restorePlaceholders } from '../../core/placeholder';

export class TextDocumentHandler implements DocumentHandler {
  readonly id = 'text';
  readonly displayName = 'Plain Text & Markdown';
  readonly supportedExtensions = ['.txt', '.md'];
  readonly supported = true;

  async sanitize(
    file: File,
    engine: SanitizationEngine,
    options?: SanitizeOptions,
  ): Promise<DocumentSanitizeResult> {
    const text = await readFileAsText(file);
    const context = buildDetectionContext(file.name, options);
    const result = await engine.sanitizeText(text, context);

    const sanitizedFileName = buildSanitizedFileName(file.name);
    const blob = new Blob([result.sanitizedText], {
      type: 'text/plain;charset=utf-8',
    });

    return {
      blob,
      sanitizedFileName,
      mapping: buildMappingRecord({
        sourceFileName: file.name,
        sanitizedFileName,
        entries: result.entries,
      }),
      totalReplacements: result.totalReplacements,
      categoryCounts: result.categoryCounts,
    };
  }

  async restore(
    file: File,
    map: MappingRecord,
    _options?: RestoreOptions,
  ): Promise<DocumentRestoreResult> {
    const text = await readFileAsText(file);
    const { restoredText, diff } = restorePlaceholders(text, map.entries);

    const blob = new Blob([restoredText], {
      type: 'text/plain;charset=utf-8',
    });

    return {
      blob,
      restoredFileName: buildRestoredFileName(file.name),
      diff,
    };
  }
}
