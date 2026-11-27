import type { SanitizationEngine } from '../../core/engine';
import type { MappingRecord } from '../../core/types';
import type {
  DocumentHandler,
  DocumentRestoreResult,
  DocumentSanitizeResult,
  RestoreOptions,
  SanitizeOptions,
} from '../types';
import { UnsupportedDocumentFormatError } from '../utils';

export const PDF_V1_UNSUPPORTED_MESSAGE =
  'PDF files are not supported yet. Please convert to .docx, .xlsx, or .txt, or stay tuned for an upcoming release.';

/**
 * Clean reservation stub for future PDF redaction support.
 * Gracefully rejects .pdf uploads with a clear user-facing notice.
 */
export class PdfDocumentHandlerStub implements DocumentHandler {
  readonly id = 'pdf';
  readonly displayName = 'PDF Documents (Planned)';
  readonly supportedExtensions = ['.pdf'];
  readonly supported = false;

  async sanitize(
    _file: File,
    _engine: SanitizationEngine,
    _options?: SanitizeOptions,
  ): Promise<DocumentSanitizeResult> {
    throw new UnsupportedDocumentFormatError(
      'PDF_UNSUPPORTED_V1',
      PDF_V1_UNSUPPORTED_MESSAGE,
    );
  }

  async restore(
    _file: File,
    _map: MappingRecord,
    _options?: RestoreOptions,
  ): Promise<DocumentRestoreResult> {
    throw new UnsupportedDocumentFormatError(
      'PDF_UNSUPPORTED_V1',
      PDF_V1_UNSUPPORTED_MESSAGE,
    );
  }
}
