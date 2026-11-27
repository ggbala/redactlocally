import type { SanitizationEngine } from '../../core/engine';
import type { MappingRecord } from '../../core/types';
import { restorePlaceholders } from '../../core/placeholder';
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
  getFileExtension,
  readFileAsText,
} from '../utils';

function getCodeMimeType(ext: string): string {
  switch (ext) {
    case '.json':
      return 'application/json;charset=utf-8';
    case '.xml':
      return 'application/xml;charset=utf-8';
    default:
      return 'text/plain;charset=utf-8';
  }
}

export class CodeDocumentHandler implements DocumentHandler {
  readonly id = 'code';
  readonly displayName = 'Code, Config & Logs';
  readonly supportedExtensions = [
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.py',
    '.json',
    '.yaml',
    '.yml',
    '.env',
    '.sql',
    '.log',
    '.xml',
    '.go',
    '.java',
    '.sh',
    '.ini',
    '.toml',
  ];
  readonly supported = true;

  async sanitize(
    file: File,
    engine: SanitizationEngine,
    options?: SanitizeOptions,
  ): Promise<DocumentSanitizeResult> {
    const ext = getFileExtension(file.name);
    const text = await readFileAsText(file);
    const context = buildDetectionContext(file.name, options);
    const result = await engine.sanitizeText(text, context);
    const warnings: string[] = [];

    if (ext === '.json') {
      let originalWasValidJson = false;
      try {
        JSON.parse(text);
        originalWasValidJson = true;
      } catch {
        originalWasValidJson = false;
      }

      if (originalWasValidJson) {
        try {
          JSON.parse(result.sanitizedText);
        } catch {
          warnings.push(
            'Sanitized JSON syntax check detected an unexpected character; please verify before uploading.',
          );
        }
      }
    }

    const sanitizedFileName = buildSanitizedFileName(file.name);
    const blob = new Blob([result.sanitizedText], {
      type: getCodeMimeType(ext),
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
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async restore(
    file: File,
    map: MappingRecord,
    _options?: RestoreOptions,
  ): Promise<DocumentRestoreResult> {
    const ext = getFileExtension(file.name);
    const text = await readFileAsText(file);
    const { restoredText, diff } = restorePlaceholders(text, map.entries);

    const blob = new Blob([restoredText], {
      type: getCodeMimeType(ext),
    });

    return {
      blob,
      restoredFileName: buildRestoredFileName(file.name),
      diff,
    };
  }
}
