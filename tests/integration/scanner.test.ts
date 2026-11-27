import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultEngine } from '@/core/engine';
import {
  DirectoryScanner,
  serializeAuditReportJson,
} from '@/scanner/directory-scanner';
import type { DirectoryFileInput } from '@/scanner/types';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function fixtureInput(
  fixtureName: string,
  relativePath: string,
  mimeType = 'application/octet-stream',
): DirectoryFileInput {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, fixtureName));
  return {
    file: new File([buf], path.basename(relativePath), { type: mimeType }),
    relativePath,
  };
}

function textInput(content: string, relativePath: string): DirectoryFileInput {
  return {
    file: new File([content], path.basename(relativePath), {
      type: 'text/plain',
    }),
    relativePath,
  };
}

describe('DirectoryScanner — Read-Only Local Folder Audit Integration', () => {
  const engine = createDefaultEngine();
  const scanner = new DirectoryScanner(engine);

  it('scans multi-format directories (.env, .json, .xlsx, .docx, PEM) with exact locations while skipping ignored dirs and unsupported binaries', async () => {
    const pemContent = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw',
      '-----END PRIVATE KEY-----',
    ].join('\n');

    const inputs: DirectoryFileInput[] = [
      fixtureInput('sample-config.env', 'acme-repo/config/prod.env'),
      fixtureInput('sample-api.json', 'acme-repo/api/settings.json'),
      fixtureInput('sample-finance.xlsx', 'acme-repo/finance/Q3_Payroll.xlsx'),
      fixtureInput('sample-contract.docx', 'acme-repo/legal/MSA.docx'),
      textInput(
        '# Safe Documentation\nNo credentials here, version v1.2.3.4, react@19.1.0.',
        'acme-repo/docs/README.md',
      ),
      textInput(pemContent, 'acme-repo/certs/dev.txt'),
      textInput(
        'OPENAI_API_KEY=sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
        'acme-repo/node_modules/some-pkg/leaked.env',
      ),
      fixtureInput('sample-dummy.pdf', 'acme-repo/docs/contract.pdf'),
      {
        file: new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
          type: 'image/png',
        }),
        relativePath: 'acme-repo/assets/logo.png',
      },
    ];

    const progressUpdates: number[] = [];
    const report = await scanner.scanFiles(inputs, {
      ignoreDefaultDirs: true,
      onProgress: (p) => progressUpdates.push(p.processed),
    });

    expect(report.rootFolderName).toBe('acme-repo');
    expect(report.cancelled).toBe(false);
    expect(report.totalFilesDiscovered).toBe(9);
    expect(report.scannedFilesCount).toBe(6); // env, json, xlsx, docx, README.md, dev.txt
    expect(report.filesWithFindingsCount).toBe(5); // all except clean README.md
    expect(report.cleanFilesCount).toBe(1);
    expect(report.skippedFilesCount).toBe(3); // node_modules, pdf, png
    expect(report.errorFilesCount).toBe(0);
    expect(report.totalFindings).toBeGreaterThanOrEqual(20);
    expect(progressUpdates.length).toBeGreaterThan(0);

    // 1. Verify .env findings include exact Line numbers
    const envFile = report.files.find(
      (f) => f.filePath === 'acme-repo/config/prod.env',
    )!;
    expect(envFile.status).toBe('findings');
    expect(envFile.findings.some((f) => f.ruleId === 'openai_key' && f.location.startsWith('Line '))).toBe(true);
    expect(envFile.findings.some((f) => f.ruleId === 'aws_access_key')).toBe(true);
    expect(envFile.findings.some((f) => f.ruleId === 'db_conn_string')).toBe(true);

    // 2. Verify Excel (.xlsx) findings include Sheet & Cell address
    const xlsxFile = report.files.find(
      (f) => f.filePath === 'acme-repo/finance/Q3_Payroll.xlsx',
    )!;
    expect(xlsxFile.status).toBe('findings');
    expect(
      xlsxFile.findings.some((f) => f.location.startsWith('Sheet "Q3_Payroll" · ')),
    ).toBe(true);
    expect(
      xlsxFile.findings.some((f) => f.ruleId === 'iban'),
    ).toBe(true);

    // 3. Verify Word (.docx) catches split <w:r><w:t> runs + Header/Footer
    const docxFile = report.files.find(
      (f) => f.filePath === 'acme-repo/legal/MSA.docx',
    )!;
    expect(docxFile.status).toBe('findings');
    expect(
      docxFile.findings.some(
        (f) =>
          f.rawValue === 'alice.smith@acme-corp.com' &&
          f.location.startsWith('Body · Paragraph'),
      ),
    ).toBe(true);
    expect(
      docxFile.findings.some(
        (f) =>
          f.rawValue === 'legal@acme-corp.com' &&
          f.location.startsWith('Header · Paragraph'),
      ),
    ).toBe(true);

    // 4. Verify multiline PEM private key caught across lines
    const pemFile = report.files.find(
      (f) => f.filePath === 'acme-repo/certs/dev.txt',
    )!;
    expect(pemFile.status).toBe('findings');
    expect(pemFile.findings[0].ruleId).toBe('private_key_block');
    expect(pemFile.findings[0].location).toBe('Lines 1–3');

    // 5. Verify ignored directory, PDF, and binary skip reasons
    const nodeModulesFile = report.files.find(
      (f) => f.filePath === 'acme-repo/node_modules/some-pkg/leaked.env',
    )!;
    expect(nodeModulesFile.status).toBe('skipped');
    expect(nodeModulesFile.skipReason).toContain('node_modules');

    const pdfFile = report.files.find(
      (f) => f.filePath === 'acme-repo/docs/contract.pdf',
    )!;
    expect(pdfFile.status).toBe('skipped');
    expect(pdfFile.skipReason).toContain('PDF');

    // 6. Verify exported JSON audit report masks all raw sensitive values
    const reportJson = serializeAuditReportJson(report);
    expect(reportJson).not.toContain('sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789');
    expect(reportJson).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(reportJson).not.toContain('alice.smith@acme-corp.com');
    const parsedReport = JSON.parse(reportJson);
    expect(parsedReport.summary.totalFindings).toBe(report.totalFindings);
  });

  it('supports custom rules, disabling default directory ignore, and AbortSignal cancellation', async () => {
    const inputs: DirectoryFileInput[] = [
      textInput(
        'Project Apollo confidential briefing.',
        'workspace/node_modules/internal/notes.txt',
      ),
      textInput('Second file alice@acme.com', 'workspace/b.txt'),
    ];

    // With ignoreDefaultDirs: false + custom rule
    const report = await scanner.scanFiles(inputs, {
      ignoreDefaultDirs: false,
      customRules: [
        {
          id: 'codename',
          label: 'Project Codename',
          mode: 'exact',
          pattern: 'Project Apollo',
          placeholderPrefix: 'PROJECT',
          enabled: true,
        },
      ],
    });

    expect(report.scannedFilesCount).toBe(2);
    expect(report.totalFindings).toBe(2);
    expect(
      report.files
        .flatMap((f) => f.findings)
        .some((f) => f.ruleLabel === 'Project Codename'),
    ).toBe(true);

    // Pre-aborted signal returns cancelled immediately
    const controller = new AbortController();
    controller.abort();
    const cancelledReport = await scanner.scanFiles(inputs, {
      signal: controller.signal,
    });
    expect(cancelledReport.cancelled).toBe(true);
    expect(cancelledReport.scannedFilesCount).toBe(0);
  });
});
