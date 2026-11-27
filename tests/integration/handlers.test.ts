import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { createDefaultEngine } from '@/core/engine';
import { defaultHandlerRegistry } from '@/handlers/registry';
import { UnsupportedDocumentFormatError, readFileAsArrayBuffer, readFileAsText } from '@/handlers/utils';
import { PDF_V1_UNSUPPORTED_MESSAGE } from '@/handlers/pdf';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function loadFixtureAsFile(fileName: string, mimeType = 'application/octet-stream'): File {
  const fullPath = path.join(FIXTURES_DIR, fileName);
  const buffer = fs.readFileSync(fullPath);
  return new File([buffer], fileName, { type: mimeType });
}

async function blobToFile(blob: Blob, fileName: string): Promise<File> {
  const buf = await readFileAsArrayBuffer(blob);
  return new File([buf], fileName, { type: blob.type });
}

describe('Document Handlers — Real Fixture Roundtrip Integration Tests', () => {
  const engine = createDefaultEngine();

  it('sanitizes and restores sample-finance.xlsx while preserving formulas, column widths, sheets, and stripping metadata', async () => {
    const file = loadFixtureAsFile('sample-finance.xlsx');
    const handler = defaultHandlerRegistry.resolveOrThrow(file.name);
    expect(handler.id).toBe('excel');

    const sanitized = await handler.sanitize(file, engine, { stripMetadata: true });
    expect(sanitized.sanitizedFileName).toBe('sample-finance_sanitized.xlsx');
    expect(sanitized.metadataStripped).toBe(true);
    expect(sanitized.mapping.entries.length).toBeGreaterThanOrEqual(8);

    // Inspect sanitized workbook
    const sanBuf = await readFileAsArrayBuffer(sanitized.blob);
    const sanWb = new ExcelJS.Workbook();
    await sanWb.xlsx.load(sanBuf);

    // 1. Metadata stripped (ExcelJS writes "Unknown" when creator is cleared)
    expect(sanWb.creator).not.toContain('Alice Finance');
    expect(['', 'Unknown']).toContain(sanWb.creator ?? '');
    expect(sanWb.lastModifiedBy ?? '').not.toContain('Bob Controller');
    expect(sanWb.company ?? '').not.toContain('Acme Holdings');

    // 2. Both sheets exist & custom column widths preserved
    const sanSheet1 = sanWb.getWorksheet('Q3_Payroll')!;
    const sanSheet2 = sanWb.getWorksheet('Vendor_Payouts')!;
    expect(sanSheet1).toBeDefined();
    expect(sanSheet2).toBeDefined();
    expect(sanSheet1.getColumn(1).width).toBe(32);
    expect(sanSheet1.getColumn(2).width).toBe(30);
    expect(sanSheet1.getColumn(3).width).toBe(18);

    // 3. Formula cell =SUM(C2:C4) preserved intact
    const formulaCell = sanSheet1.getCell('C5');
    expect(formulaCell.formula).toBe('SUM(C2:C4)');
    expect(formulaCell.result).toBe(35000);

    // 4. Zero sensitive leaks across workbook + cross-sheet consistency for alice.smith@acme-corp.com
    const sheet1EmailPlaceholder = String(sanSheet1.getCell('A2').value);
    const sheet2EmailPlaceholder = String(sanSheet2.getCell('A2').value);
    expect(sheet1EmailPlaceholder).toMatch(/^\[EMAIL_\d+\]$/);
    expect(sheet2EmailPlaceholder).toBe(sheet1EmailPlaceholder);

    const allSanitizedCellText: string[] = [];
    sanWb.eachSheet((ws) => {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          allSanitizedCellText.push(JSON.stringify(cell.value));
        });
      });
    });
    const combinedSanText = allSanitizedCellText.join('\n');
    expect(combinedSanText).not.toContain('alice.smith@acme-corp.com');
    expect(combinedSanText).not.toContain('bob.jones@acme-corp.com');
    expect(combinedSanText).not.toContain('carol@acme-corp.com');
    expect(combinedSanText).not.toContain('DE89 3704 0044 0532 0130 00');
    expect(combinedSanText).not.toContain('123-45-6789');
    expect(combinedSanText).not.toContain('DEUTDEFF500');

    // 5. Roundtrip restore -> verify 100% original values & formula intact
    const sanitizedFile = await blobToFile(sanitized.blob, sanitized.sanitizedFileName);
    const restored = await handler.restore(sanitizedFile, sanitized.mapping);
    expect(restored.restoredFileName).toBe('sample-finance_restored.xlsx');
    expect(restored.diff.unmatchedCount).toBe(0);
    expect(restored.diff.unknownCount).toBe(0);

    const restBuf = await readFileAsArrayBuffer(restored.blob);
    const restWb = new ExcelJS.Workbook();
    await restWb.xlsx.load(restBuf);

    const restSheet1 = restWb.getWorksheet('Q3_Payroll')!;
    const restSheet2 = restWb.getWorksheet('Vendor_Payouts')!;
    expect(restSheet1.getCell('A2').value).toBe('alice.smith@acme-corp.com');
    expect(restSheet1.getCell('B2').value).toBe('DE89 3704 0044 0532 0130 00');
    expect(restSheet1.getCell('D2').value).toBe('+1-415-555-0199');
    expect(restSheet1.getCell('C5').formula).toBe('SUM(C2:C4)');
    expect(restSheet2.getCell('A2').value).toBe('alice.smith@acme-corp.com');
    expect(restSheet2.getCell('B2').value).toBe('SWIFT: DEUTDEFF500');
    expect(restSheet2.getCell('C2').value).toBe('123-45-6789');

    // Verify RichText cell restored with font styling preserved
    const richVal = restSheet1.getCell('A4').value as {
      richText: Array<{ text: string; font?: { bold?: boolean } }>;
    };
    expect(richVal.richText.map((r) => r.text).join('')).toBe(
      'Lead: carol@acme-corp.com',
    );
    expect(richVal.richText.some((r) => r.font?.bold === true)).toBe(true);
  });

  it('sanitizes and restores sample-clients.csv preserving quoted commas and UTF-8 characters', async () => {
    const file = loadFixtureAsFile('sample-clients.csv', 'text/csv');
    const handler = defaultHandlerRegistry.resolveOrThrow(file.name);
    const originalText = await readFileAsText(file);

    const sanitized = await handler.sanitize(file, engine);
    const sanitizedText = await readFileAsText(sanitized.blob);

    // Zero leaks
    expect(sanitizedText).not.toContain('alice.smith@acme-corp.com');
    expect(sanitizedText).not.toContain('jurgen.muller@berlin-ag.de');
    expect(sanitizedText).not.toContain('DE89 3704 0044 0532 0130 00');
    expect(sanitizedText).not.toContain('+1-415-555-0199');

    // UTF-8 & quoted comma structure preserved
    expect(sanitizedText).toContain('"Smith, Alice"');
    expect(sanitizedText).toContain('"Müller, Jürgen"');
    expect(sanitizedText).toContain('café & Zürich office');

    // Roundtrip restore -> exact cell-by-cell matrix equality with zero column shift
    const sanitizedFile = await blobToFile(sanitized.blob, sanitized.sanitizedFileName);
    const restored = await handler.restore(sanitizedFile, sanitized.mapping);
    const restoredText = await readFileAsText(restored.blob);

    const originalRows = Papa.parse<string[]>(originalText, { header: false }).data;
    const restoredRows = Papa.parse<string[]>(restoredText, { header: false }).data;
    expect(restoredRows).toEqual(originalRows);
    expect(restoredText).toContain('"Smith, Alice"');
    expect(restoredText).toContain('"Müller, Jürgen"');
    expect(restoredText).toContain('"Priority Q3 client, café & Zürich office"');
    expect(restored.diff.unmatchedCount).toBe(0);
    expect(restored.diff.unknownCount).toBe(0);
  });

  it('sanitizes and restores sample-contract.docx catching split <w:r><w:t> runs, headers/footers, tables, and stripping metadata', async () => {
    const file = loadFixtureAsFile('sample-contract.docx');
    const handler = defaultHandlerRegistry.resolveOrThrow(file.name);
    expect(handler.id).toBe('word');

    const sanitized = await handler.sanitize(file, engine, { stripMetadata: true });
    expect(sanitized.sanitizedFileName).toBe('sample-contract_sanitized.docx');
    expect(sanitized.metadataStripped).toBe(true);

    // Inspect sanitized DOCX zip XML directly
    const sanZip = await JSZip.loadAsync(await readFileAsArrayBuffer(sanitized.blob));
    const sanDocXml = await sanZip.file('word/document.xml')!.async('string');
    const sanHeaderXml = await sanZip.file('word/header1.xml')!.async('string');
    const sanFooterXml = await sanZip.file('word/footer1.xml')!.async('string');
    const sanCoreXml = await sanZip.file('docProps/core.xml')!.async('string');
    const sanAppXml = await sanZip.file('docProps/app.xml')!.async('string');

    // Proof that split <w:r><w:t> email & phone were merged and caught!
    expect(sanDocXml).not.toContain('alice');
    expect(sanDocXml).not.toContain('acme-corp.com');
    expect(sanDocXml).not.toContain('+1-415');
    expect(sanDocXml).not.toContain('-555-0199');
    expect(sanDocXml).not.toContain('DE89 3704 0044 0532 0130 00');
    expect(sanDocXml).not.toContain('123-45-6789');

    // Formatting tags (<w:b/>, <w:tbl>) preserved
    expect(sanDocXml).toContain('<w:b');
    expect(sanDocXml).toContain('<w:tbl>');

    // Header & footer scrubbed
    expect(sanHeaderXml).not.toContain('legal@acme-corp.com');
    expect(sanFooterXml).not.toContain('alice.smith@acme-corp.com');
    expect(sanFooterXml).not.toContain('(415) 555-0142');

    // Metadata stripped
    expect(sanCoreXml).not.toContain('Jane Counsel');
    expect(sanCoreXml).not.toContain('John Partner');
    expect(sanAppXml).not.toContain('Acme Legal LLP');

    // Roundtrip restore
    const sanitizedFile = await blobToFile(sanitized.blob, sanitized.sanitizedFileName);
    const restored = await handler.restore(sanitizedFile, sanitized.mapping);
    expect(restored.restoredFileName).toBe('sample-contract_restored.docx');
    expect(restored.diff.unmatchedCount).toBe(0);
    expect(restored.diff.unknownCount).toBe(0);

    const restZip = await JSZip.loadAsync(await readFileAsArrayBuffer(restored.blob));
    const restDocXml = await restZip.file('word/document.xml')!.async('string');
    const restHeaderXml = await restZip.file('word/header1.xml')!.async('string');
    const restFooterXml = await restZip.file('word/footer1.xml')!.async('string');

    expect(restDocXml).toContain('alice.smith@acme-corp.com');
    expect(restDocXml).toContain('+1-415-555-0199');
    expect(restDocXml).toContain('DE89 3704 0044 0532 0130 00');
    expect(restDocXml).toContain('123-45-6789');
    expect(restHeaderXml).toContain('legal@acme-corp.com');
    expect(restFooterXml).toContain('alice.smith@acme-corp.com');
    expect(restFooterXml).toContain('(415) 555-0142');
  });

  it('sanitizes sample-api.json keeping JSON.parse valid and restores byte-for-byte', async () => {
    const file = loadFixtureAsFile('sample-api.json', 'application/json');
    const handler = defaultHandlerRegistry.resolveOrThrow(file.name);
    expect(handler.id).toBe('code');

    const originalText = await readFileAsText(file);
    const sanitized = await handler.sanitize(file, engine);
    const sanitizedText = await readFileAsText(sanitized.blob);

    // Must remain 100% valid JSON!
    const parsedSanitized = JSON.parse(sanitizedText);
    expect(parsedSanitized.version).toBe('v1.2.3.4'); // version untouched
    expect(parsedSanitized.owner.email).toMatch(/^\[EMAIL_\d+\]$/);
    expect(parsedSanitized.credentials.openaiKey).toMatch(/^\[OPENAI_KEY_\d+\]$/);
    expect(parsedSanitized.credentials.awsAccessKey).toMatch(/^\[AWS_KEY_\d+\]$/);
    expect(parsedSanitized.credentials.stripeKey).toMatch(/^\[STRIPE_KEY_\d+\]$/);
    expect(parsedSanitized.credentials.password).toMatch(/^\[SECRET_\d+\]$/);
    expect(parsedSanitized.network.databaseUri).toMatch(/^\[DB_URI_\d+\]$/);

    // Zero leaks
    expect(sanitizedText).not.toContain('devops@acme-corp.com');
    expect(sanitizedText).not.toContain('sk-proj-');
    expect(sanitizedText).not.toContain('ProdDBPassword!2026');
    expect(sanitizedText).not.toContain('Sup3rS3cret');

    // Byte-for-byte restore
    const sanitizedFile = await blobToFile(sanitized.blob, sanitized.sanitizedFileName);
    const restored = await handler.restore(sanitizedFile, sanitized.mapping);
    expect(await readFileAsText(restored.blob)).toBe(originalText);
    expect(restored.diff.unmatchedCount).toBe(0);
    expect(restored.diff.unknownCount).toBe(0);
  });

  it.each([
    'sample-config.env',
    'sample-query.sql',
    'sample-app.log',
    'sample-notes.txt',
  ])('sanitizes and restores %s byte-for-byte with zero leaks', async (fixtureName) => {
    const file = loadFixtureAsFile(fixtureName, 'text/plain');
    const handler = defaultHandlerRegistry.resolveOrThrow(file.name);
    const originalText = await readFileAsText(file);

    const sanitized = await handler.sanitize(file, engine);
    const sanitizedText = await readFileAsText(sanitized.blob);

    expect(sanitized.mapping.entries.length).toBeGreaterThanOrEqual(3);
    for (const entry of sanitized.mapping.entries) {
      expect(sanitizedText).not.toContain(entry.originalValue);
      expect(sanitizedText).toContain(entry.placeholder);
    }

    const sanitizedFile = await blobToFile(sanitized.blob, sanitized.sanitizedFileName);
    const restored = await handler.restore(sanitizedFile, sanitized.mapping);
    expect(await readFileAsText(restored.blob)).toBe(originalText);
    expect(restored.diff.unmatchedCount).toBe(0);
    expect(restored.diff.unknownCount).toBe(0);
  });

  it('gracefully rejects sample-dummy.pdf with clear V1 unsupported message without crashing', async () => {
    const pdfFile = loadFixtureAsFile('sample-dummy.pdf', 'application/pdf');
    const handler = defaultHandlerRegistry.resolveOrThrow(pdfFile.name);
    expect(handler.id).toBe('pdf');
    expect(handler.supported).toBe(false);

    await expect(handler.sanitize(pdfFile, engine)).rejects.toThrow(
      UnsupportedDocumentFormatError,
    );
    await expect(handler.sanitize(pdfFile, engine)).rejects.toThrow(
      PDF_V1_UNSUPPORTED_MESSAGE,
    );

    // Unsupported arbitrary binary also fails cleanly
    expect(() => defaultHandlerRegistry.resolveOrThrow('photo.png')).toThrow(
      UnsupportedDocumentFormatError,
    );
  });
});
