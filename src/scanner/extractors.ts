import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  getFileExtension,
  readFileAsArrayBuffer,
  readFileAsText,
} from '../handlers/utils';
import { parseDocxXmlPart } from '../handlers/word/docx-xml';
import { defaultHandlerRegistry } from '../handlers/registry';
import type { ScannedSegment } from './types';

const DOCX_TEXT_PART_PATTERN =
  /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i;

export type ExtractionResult =
  | { kind: 'segments'; segments: ScannedSegment[] }
  | { kind: 'skipped'; reason: string };

function formatDocxPartLabel(partPath: string): string {
  const lower = partPath.toLowerCase();
  if (lower === 'word/document.xml') return 'Body';
  if (lower.includes('header')) return 'Header';
  if (lower.includes('footer')) return 'Footer';
  if (lower.includes('footnote')) return 'Footnote';
  if (lower.includes('endnote')) return 'Endnote';
  if (lower.includes('comment')) return 'Comment';
  return 'Document';
}

async function extractXlsxSegments(file: File): Promise<ScannedSegment[]> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const segments: ScannedSegment[] = [];

  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        const location = `Sheet "${sheet.name}" · ${cell.address}`;

        if (typeof val === 'string' && val.trim().length > 0) {
          segments.push({ location, text: val });
          return;
        }

        if (typeof val === 'object' && val !== null) {
          if ('richText' in val && Array.isArray(val.richText)) {
            const combined = val.richText.map((r) => r.text).join('');
            if (combined.trim().length > 0) {
              segments.push({ location, text: combined });
            }
            return;
          }
          if ('hyperlink' in val && 'text' in val) {
            const text = `${String(val.text ?? '')} ${String(val.hyperlink ?? '')}`.trim();
            if (text.length > 0) {
              segments.push({ location, text });
            }
            return;
          }
          if ('formula' in val && typeof val.result === 'string' && val.result.trim().length > 0) {
            segments.push({ location, text: val.result });
          }
        }
      });
    });
  });

  return segments;
}

async function extractDocxSegments(file: File): Promise<ScannedSegment[]> {
  const buffer = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buffer);
  if (!zip.file('word/document.xml')) {
    throw new Error('Missing word/document.xml inside .docx archive.');
  }

  const xmlPaths = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir && DOCX_TEXT_PART_PATTERN.test(name))
    .sort((a, b) => {
      if (a === 'word/document.xml') return -1;
      if (b === 'word/document.xml') return 1;
      return a.localeCompare(b);
    });

  const segments: ScannedSegment[] = [];

  for (const partPath of xmlPaths) {
    const xmlText = await zip.file(partPath)!.async('string');
    const parsed = parseDocxXmlPart(partPath, xmlText);
    const partLabel = formatDocxPartLabel(partPath);
    let paraIndex = 0;

    for (const para of parsed.paragraphs) {
      if (para.fullText.trim().length === 0) {
        continue;
      }
      paraIndex += 1;
      segments.push({
        location: `${partLabel} · Paragraph ${paraIndex}`,
        text: para.fullText,
      });
    }
  }

  return segments;
}

async function extractLineSegments(file: File): Promise<ScannedSegment[]> {
  const text = await readFileAsText(file);
  if (!text) {
    return [];
  }

  // Detect multiline PEM private key blocks before line splitting so multi-line blocks aren't missed
  const segments: ScannedSegment[] = [];
  const lines = text.split(/\r?\n/);

  // Track lines consumed by PEM blocks so they are reported once at their starting line
  const pemLineSet = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(lines[i])) {
      let endIdx = -1;
      for (let j = i + 1; j < Math.min(lines.length, i + 200); j++) {
        if (/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(lines[j])) {
          endIdx = j;
          break;
        }
      }
      if (endIdx !== -1) {
        const blockText = lines.slice(i, endIdx + 1).join('\n');
        segments.push({
          location: `Lines ${i + 1}–${endIdx + 1}`,
          lineNumber: i + 1,
          text: blockText,
        });
        for (let k = i; k <= endIdx; k++) {
          pemLineSet.add(k);
        }
        i = endIdx;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (pemLineSet.has(i)) {
      continue;
    }
    const line = lines[i];
    if (line.trim().length === 0) {
      continue;
    }
    segments.push({
      location: `Line ${i + 1}`,
      lineNumber: i + 1,
      text: line,
    });
  }

  return segments;
}

/**
 * Extracts read-only text segments with location metadata for any supported file format.
 * Never modifies the source file.
 */
export async function extractReadableSegments(
  file: File,
): Promise<ExtractionResult> {
  const ext = getFileExtension(file.name);
  const handler = defaultHandlerRegistry.getHandlerForFile(file.name);

  if (!handler) {
    return {
      kind: 'skipped',
      reason: ext
        ? `Unsupported file type (${ext})`
        : 'Unsupported file without extension',
    };
  }

  if (!handler.supported) {
    return {
      kind: 'skipped',
      reason:
        ext === '.pdf'
          ? 'PDF scanning is not supported yet'
          : `Unsupported format (${ext})`,
    };
  }

  if (ext === '.xlsx') {
    return { kind: 'segments', segments: await extractXlsxSegments(file) };
  }

  if (ext === '.xls') {
    try {
      return { kind: 'segments', segments: await extractXlsxSegments(file) };
    } catch {
      return {
        kind: 'skipped',
        reason: 'Legacy binary .xls cannot be scanned offline yet',
      };
    }
  }

  if (ext === '.docx') {
    return { kind: 'segments', segments: await extractDocxSegments(file) };
  }

  // .csv, .txt, .md, and all 17 code/config extensions
  return { kind: 'segments', segments: await extractLineSegments(file) };
}
