import JSZip from 'jszip';
import type { SanitizationEngine } from '../../core/engine';
import type { MappingRecord } from '../../core/types';
import { PlaceholderRestorer } from '../../core/placeholder';
import { createDiffAccumulator } from '../../core/diff';
import type {
  DocumentHandler,
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
  readFileAsArrayBuffer,
} from '../utils';
import {
  applySpansToParagraphNodes,
  parseDocxXmlPart,
  serializeDocxXml,
  stripMetadataXml,
  type ParsedXmlPart,
} from './docx-xml';

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const DOCX_TEXT_PART_PATTERN =
  /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i;

async function loadDocxZip(file: File): Promise<JSZip> {
  const buffer = await readFileAsArrayBuffer(file);
  try {
    const zip = await JSZip.loadAsync(buffer);
    if (!zip.file('word/document.xml')) {
      throw new Error('Missing word/document.xml inside .docx archive.');
    }
    return zip;
  } catch (err) {
    throw new UnsupportedDocumentFormatError(
      'CORRUPT_DOCUMENT',
      `Unable to parse Word (.docx) file "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function getTargetXmlPaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir && DOCX_TEXT_PART_PATTERN.test(name))
    .sort((a, b) => {
      if (a === 'word/document.xml') return -1;
      if (b === 'word/document.xml') return 1;
      return a.localeCompare(b);
    });
}

export class WordDocumentHandler implements DocumentHandler {
  readonly id = 'word';
  readonly displayName = 'Word Documents (.docx)';
  readonly supportedExtensions = ['.docx'];
  readonly supported = true;

  async sanitize(
    file: File,
    engine: SanitizationEngine,
    options?: SanitizeOptions,
  ): Promise<DocumentSanitizeResult> {
    const zip = await loadDocxZip(file);
    const xmlPaths = getTargetXmlPaths(zip);
    const parsedParts: ParsedXmlPart[] = [];

    for (const partPath of xmlPaths) {
      const xmlText = await zip.file(partPath)!.async('string');
      parsedParts.push(parseDocxXmlPart(partPath, xmlText));
    }

    const context = buildDetectionContext(file.name, options);
    const session = engine.createSession(context);

    // Pass 0: reserve existing literal placeholders across body, headers, and footers
    for (const part of parsedParts) {
      for (const para of part.paragraphs) {
        if (para.fullText.length > 0) {
          session.reserveExistingPlaceholders(para.fullText);
        }
      }
    }

    // Pass 1: detect & replace across merged <w:r><w:t> runs while preserving styling
    for (const part of parsedParts) {
      let modified = false;
      for (const para of part.paragraphs) {
        if (para.fullText.length === 0) {
          continue;
        }
        const spans = await session.getChunkReplacements(para.fullText);
        if (spans.length > 0) {
          applySpansToParagraphNodes(para.textNodes, spans);
          modified = true;
        }
      }
      if (modified) {
        zip.file(part.path, serializeDocxXml(part.doc));
      }
    }

    const shouldStripMetadata = options?.stripMetadata !== false;
    let metadataStripped = false;
    if (shouldStripMetadata) {
      const coreFile = zip.file('docProps/core.xml');
      if (coreFile) {
        const coreXml = await coreFile.async('string');
        zip.file('docProps/core.xml', stripMetadataXml(coreXml, 'core'));
        metadataStripped = true;
      }
      const appFile = zip.file('docProps/app.xml');
      if (appFile) {
        const appXml = await appFile.async('string');
        zip.file('docProps/app.xml', stripMetadataXml(appXml, 'app'));
        metadataStripped = true;
      }
    }

    const outBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const blob = new Blob([outBuffer], { type: DOCX_MIME });
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
      metadataStripped,
    };
  }

  async restore(
    file: File,
    map: MappingRecord,
    _options?: RestoreOptions,
  ): Promise<DocumentRestoreResult> {
    const zip = await loadDocxZip(file);
    const xmlPaths = getTargetXmlPaths(zip);
    const restorer = new PlaceholderRestorer(map.entries);
    const accumulator = createDiffAccumulator(map.entries);

    for (const partPath of xmlPaths) {
      const xmlText = await zip.file(partPath)!.async('string');
      const part = parseDocxXmlPart(partPath, xmlText);
      let modified = false;

      for (const para of part.paragraphs) {
        if (para.fullText.length === 0) {
          continue;
        }
        const spans = restorer.getRestoreSpans(para.fullText, accumulator);
        if (spans.length > 0) {
          applySpansToParagraphNodes(para.textNodes, spans);
          modified = true;
        }
      }

      if (modified) {
        zip.file(part.path, serializeDocxXml(part.doc));
      }
    }

    const outBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const blob = new Blob([outBuffer], { type: DOCX_MIME });

    return {
      blob,
      restoredFileName: buildRestoredFileName(file.name),
      diff: accumulator.finalize(),
    };
  }
}
