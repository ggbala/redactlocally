import type { DocumentHandler } from './types';
import { ExcelDocumentHandler } from './excel';
import { WordDocumentHandler } from './word';
import { TextDocumentHandler } from './text';
import { CodeDocumentHandler } from './code';
import { PdfDocumentHandlerStub } from './pdf';
import {
  UnsupportedDocumentFormatError,
  getFileExtension,
} from './utils';

export class DocumentHandlerRegistry {
  private readonly handlers: DocumentHandler[] = [];
  private readonly extensionMap = new Map<string, DocumentHandler>();

  constructor(initialHandlers: readonly DocumentHandler[] = []) {
    for (const handler of initialHandlers) {
      this.register(handler);
    }
  }

  register(handler: DocumentHandler): void {
    this.handlers.push(handler);
    for (const ext of handler.supportedExtensions) {
      this.extensionMap.set(ext.toLowerCase(), handler);
    }
  }

  getHandlerByExtension(ext: string): DocumentHandler | null {
    return this.extensionMap.get(ext.toLowerCase()) ?? null;
  }

  getHandlerForFile(fileName: string): DocumentHandler | null {
    const ext = getFileExtension(fileName);
    if (!ext) {
      return null;
    }
    return this.getHandlerByExtension(ext);
  }

  /**
   * Resolves a handler or throws a clear UnsupportedDocumentFormatError
   * (giving PDF its dedicated V2 notice and other binary formats a friendly supported list).
   */
  resolveOrThrow(fileName: string): DocumentHandler {
    const handler = this.getHandlerForFile(fileName);
    if (handler) {
      return handler;
    }

    const ext = getFileExtension(fileName) || 'unknown';
    throw new UnsupportedDocumentFormatError(
      'UNSUPPORTED_FORMAT',
      `File type "${ext}" is not supported. Supported formats: ${this.getSupportedExtensions().join(', ')}.`,
    );
  }

  getAllHandlers(): readonly DocumentHandler[] {
    return this.handlers;
  }

  getSupportedHandlers(): DocumentHandler[] {
    return this.handlers.filter((h) => h.supported);
  }

  getSupportedExtensions(): string[] {
    const exts: string[] = [];
    for (const handler of this.handlers) {
      if (handler.supported) {
        exts.push(...handler.supportedExtensions);
      }
    }
    return exts;
  }

  getAcceptAttribute(): string {
    return this.getSupportedExtensions().join(',');
  }
}

export function createDefaultHandlerRegistry(): DocumentHandlerRegistry {
  return new DocumentHandlerRegistry([
    new ExcelDocumentHandler(),
    new WordDocumentHandler(),
    new TextDocumentHandler(),
    new CodeDocumentHandler(),
    new PdfDocumentHandlerStub(),
  ]);
}

export const defaultHandlerRegistry = createDefaultHandlerRegistry();
