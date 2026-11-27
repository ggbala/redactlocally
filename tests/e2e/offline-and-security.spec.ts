import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.join(ROOT_DIR, 'tests/fixtures');
const OFFLINE_HTML_PATH = path.join(
  ROOT_DIR,
  'dist-offline/local-sanitizer-offline.html',
);

test.describe('Security, UX Alignment & Offline Single-HTML E2E Suite', () => {
  test('enforces 100% English UI, strict equal-width pill controller alignment, SEO sections, and zero outbound network requests across Text & Document workflows', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Verify top security banner, footer open-source declaration, and 100% English UI
    await expect(page.getByTestId('trust-banner')).toContainText(
      '100% Local & Offline Processing',
    );
    await expect(page.getByTestId('open-source-footer')).toContainText(
      'MIT License',
    );
    await expect(page.getByTestId('footer-github-link')).toBeVisible();

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toMatch(/[\u4e00-\u9fff]/);

    // 2. Verify below-the-fold SEO sections & JSON-LD schemas
    await expect(page.getByTestId('seo-how-it-works')).toBeVisible();
    await expect(page.getByTestId('seo-supported-rules')).toBeVisible();
    await expect(page.locator('[data-testid="seo-faq"] details')).toHaveCount(9);

    const jsonLdCount = await page
      .locator('script[type="application/ld+json"]')
      .count();
    expect(jsonLdCount).toBe(2);

    // 3. Verify strict pixel-level width alignment between pill controller and workspace below it
    const controllerBox = await page
      .getByTestId('mode-segmented-controller')
      .boundingBox();
    const textWorkspaceBox = await page
      .getByTestId('text-workspace')
      .boundingBox();
    expect(controllerBox).not.toBeNull();
    expect(textWorkspaceBox).not.toBeNull();
    expect(
      Math.abs(controllerBox!.width - textWorkspaceBox!.width),
    ).toBeLessThanOrEqual(1);

    // 4. Attach strict ZERO NETWORK EGRESS interceptor after initial page load
    const outboundRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('blob:') && !url.startsWith('data:')) {
        outboundRequests.push(`${req.method()} ${url}`);
      }
    });

    // === TEXT MODE FULL WORKFLOW ===
    // Row 2 must be collapsed by default
    await expect(page.getByTestId('text-restore-drawer')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(page.getByTestId('toggle-text-restore-btn')).toBeDisabled();

    // Load sample & sanitize
    await page.getByTestId('load-sample-text-btn').click();
    await page.getByTestId('text-sanitize-btn').click();

    const sanitizedText = await page
      .getByTestId('text-sanitized-output')
      .inputValue();
    expect(sanitizedText).toContain('[EMAIL_1]');
    expect(sanitizedText).toContain('[AWS_KEY_1]');
    expect(sanitizedText).toContain('[OPENAI_KEY_1]');
    expect(sanitizedText).not.toContain('alice.smith@acme-corp.com');
    expect(sanitizedText).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(sanitizedText).not.toContain('sk-proj-');

    // Bridge bar becomes ready & Restore AI Reply expands smoothly
    await expect(page.getByTestId('text-bridge-bar')).toContainText(
      'Local memory only',
    );
    await page.getByTestId('toggle-text-restore-btn').click();
    await expect(page.getByTestId('text-restore-drawer')).toHaveAttribute(
      'aria-hidden',
      'false',
    );
    await expect(page.getByTestId('restore-context-banner')).toContainText(
      'Restoring based on mapping generated at',
    );

    // Restore AI reply with known + unknown placeholder
    await page
      .getByTestId('text-restore-input')
      .fill(
        'Action item: notify [EMAIL_1] and rotate [AWS_KEY_1]. Unknown ref: [PHONE_99].',
      );
    await expect(page.getByTestId('text-restore-btn')).toBeEnabled();
    await page.getByTestId('text-restore-btn').click();

    await expect(page.getByTestId('text-restore-output')).toHaveValue(
      'Action item: notify alice.smith@acme-corp.com and rotate AKIAIOSFODNN7EXAMPLE. Unknown ref: [PHONE_99].',
    );
    await expect(page.getByTestId('text-restore-drawer')).toContainText(
      '1 unrecognized placeholder left unchanged',
    );

    // Overwrite memory map while Row 2 is open -> verify stale notice
    await page
      .getByTestId('text-original-input')
      .fill('New prompt only containing bob@acme.com');
    await page.getByTestId('text-sanitize-btn').click();
    await expect(page.getByTestId('stale-mapping-notice')).toBeVisible();

    // === DOCUMENT MODE FULL WORKFLOW ===
    await page.getByTestId('tab-doc-mode').click();
    const docWorkspaceBox = await page
      .getByTestId('doc-workspace')
      .boundingBox();
    expect(docWorkspaceBox).not.toBeNull();
    expect(
      Math.abs(controllerBox!.width - docWorkspaceBox!.width),
    ).toBeLessThanOrEqual(1);

    // 1. PDF graceful rejection
    await page
      .getByTestId('doc-sanitize-file-input')
      .setInputFiles(path.join(FIXTURES_DIR, 'sample-dummy.pdf'));
    await expect(page.getByTestId('doc-sanitize-error')).toContainText(
      'PDF files are not supported yet',
    );

    // 2. Sanitize Excel (.xlsx) and capture downloaded sanitized file
    await page
      .getByTestId('doc-sanitize-file-input')
      .setInputFiles(path.join(FIXTURES_DIR, 'sample-finance.xlsx'));
    await expect(page.getByTestId('doc-sanitize-result')).toContainText(
      'sample-finance.xlsx sanitized',
    );
    await expect(page.getByTestId('doc-sanitize-result')).toContainText(
      'IndexedDB',
    );

    const [sanitizedXlsxDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-sanitized-doc-btn').click(),
    ]);
    const sanitizedXlsxPath = await sanitizedXlsxDownload.path();
    expect(sanitizedXlsxPath).not.toBeNull();

    // 3. Sanitize Word (.docx) so we have 2 saved maps in IndexedDB
    await page
      .getByTestId('doc-sanitize-file-input')
      .setInputFiles(path.join(FIXTURES_DIR, 'sample-contract.docx'));
    await expect(page.getByTestId('doc-sanitize-result')).toContainText(
      'sample-contract.docx sanitized',
    );

    // 4. Go to Restore view -> default active map is newest (sample-contract_sanitized.docx)
    await page.getByTestId('go-to-restore-btn').click();
    await expect(page.getByTestId('active-map-name')).toContainText(
      'sample-contract_sanitized.docx',
    );

    // 5. Switch to sample-finance.xlsx map
    await page.getByTestId('switch-map-btn').click();
    await page
      .getByTestId('switch-map-dropdown')
      .getByText('sample-finance.xlsx')
      .click();
    await expect(page.getByTestId('active-map-name')).toContainText(
      'sample-finance_sanitized.xlsx',
    );

    // 6. Export .json key map and verify _security_warning header
    const [keyfileDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-active-map-btn').click(),
    ]);
    const keyfilePath = await keyfileDownload.path();
    expect(keyfilePath).not.toBeNull();
    const exportedJson = JSON.parse(fs.readFileSync(keyfilePath!, 'utf-8'));
    expect(exportedJson._security_warning).toContain('CONFIDENTIAL KEY FILE');

    // 7. Upload sanitized .xlsx file -> verify restoration & diff feedback
    await page.getByTestId('doc-restore-file-input').setInputFiles({
      name: 'sample-finance_sanitized.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fs.readFileSync(sanitizedXlsxPath!),
    });
    await expect(page.getByTestId('doc-restore-result')).toBeVisible();
    await expect(page.getByTestId('doc-restore-summary')).toContainText(
      '0 unmatched',
    );
    await expect(page.getByTestId('download-restored-doc-btn')).toContainText(
      'Download Restored Excel File',
    );

    // 8. Expand Local Mapping Vault drawer and confirm 2 saved maps
    await expect(page.getByTestId('local-mapping-vault')).toContainText(
      '2 saved',
    );
    await page.getByTestId('toggle-vault-drawer-btn').click();
    await expect(page.getByTestId('vault-drawer-body')).toContainText(
      'sample-finance.xlsx',
    );
    await expect(page.getByTestId('vault-drawer-body')).toContainText(
      'sample-contract.docx',
    );

    // === DIRECTORY SCANNER (TAB 3 — READ-ONLY SCAN & ALERT) ===
    await page.getByTestId('tab-folder-mode').click();
    const folderWorkspaceBox = await page
      .getByTestId('folder-workspace')
      .boundingBox();
    expect(folderWorkspaceBox).not.toBeNull();
    expect(
      Math.abs(controllerBox!.width - folderWorkspaceBox!.width),
    ).toBeLessThanOrEqual(1);

    // Scan local fixtures directory (read-only)
    await page.getByTestId('folder-scan-input').setInputFiles(FIXTURES_DIR);
    await expect(page.getByTestId('folder-scan-report')).toBeVisible();
    const totalFindingsText = await page
      .getByTestId('scan-total-findings')
      .innerText();
    expect(Number(totalFindingsText)).toBeGreaterThanOrEqual(20);

    // Verify findings are masked by default and eye icon reveals raw value
    const firstFindingRow = page.getByTestId('scan-finding-row').first();
    const maskedBefore = await firstFindingRow
      .getByTestId('finding-value')
      .innerText();
    await firstFindingRow.getByTestId('toggle-finding-reveal-btn').click();
    const revealedAfter = await firstFindingRow
      .getByTestId('finding-value')
      .innerText();
    expect(revealedAfter).not.toBe(maskedBefore);

    // Export masked read-only audit report JSON and verify no raw secrets leaked
    const [auditDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-scan-report-btn').click(),
    ]);
    const auditPath = await auditDownload.path();
    expect(auditPath).not.toBeNull();
    const auditText = fs.readFileSync(auditPath!, 'utf-8');
    expect(auditText).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(auditText).not.toContain('sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789');

    // IRON RULE ASSERTIONS: Zero runtime errors & ZERO outbound network requests!
    expect(pageErrors).toEqual([]);
    expect(outboundRequests).toEqual([]);
  });

  test('runs standalone dist-offline/local-sanitizer-offline.html completely offline with noindex meta and full text + document functionality', async ({
    browser,
  }) => {
    expect(
      fs.existsSync(OFFLINE_HTML_PATH),
      `Offline single-HTML bundle missing at ${OFFLINE_HTML_PATH}. Run "npm run build:offline" first.`,
    ).toBe(true);

    const rawHtml = fs.readFileSync(OFFLINE_HTML_PATH, 'utf-8');
    expect(rawHtml).toContain('noindex, nofollow');
    expect(rawHtml).not.toContain('rel="canonical"');

    const context = await browser.newContext({ acceptDownloads: true });
    await context.setOffline(true);
    const page = await context.newPage();

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const fileUrl = pathToFileURL(OFFLINE_HTML_PATH).href;
    await page.goto(fileUrl, { waitUntil: 'load' });

    // Confirm offline SEO protection meta in DOM
    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .getAttribute('content');
    expect(robotsMeta).toBe('noindex, nofollow');
    expect(await page.locator('link[rel="canonical"]').count()).toBe(0);

    // Confirm Text Mode sanitize + restore works offline
    await page
      .getByTestId('text-original-input')
      .fill('Offline check: alice@acme.com and 192.168.1.10');
    await page.getByTestId('text-sanitize-btn').click();

    const sanitized = await page
      .getByTestId('text-sanitized-output')
      .inputValue();
    expect(sanitized).toBe('Offline check: [EMAIL_1] and [IP_1]');

    await page.getByTestId('toggle-text-restore-btn').click();
    await page.getByTestId('text-restore-input').fill(sanitized);
    await expect(page.getByTestId('text-restore-btn')).toBeEnabled();
    await page.getByTestId('text-restore-btn').click();
    await expect(page.getByTestId('text-restore-output')).toHaveValue(
      'Offline check: alice@acme.com and 192.168.1.10',
    );

    // Confirm Document Mode (.docx) works offline under file://
    await page.getByTestId('tab-doc-mode').click();
    await page
      .getByTestId('doc-sanitize-file-input')
      .setInputFiles(path.join(FIXTURES_DIR, 'sample-contract.docx'));
    await expect(page.getByTestId('doc-sanitize-result')).toContainText(
      'sample-contract.docx sanitized',
    );

    const [sanDocxDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-sanitized-doc-btn').click(),
    ]);
    const sanDocxPath = await sanDocxDownload.path();
    expect(sanDocxPath).not.toBeNull();

    await page.getByTestId('go-to-restore-btn').click();
    await page.getByTestId('doc-restore-file-input').setInputFiles({
      name: 'sample-contract_sanitized.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: fs.readFileSync(sanDocxPath!),
    });
    await expect(page.getByTestId('doc-restore-summary')).toContainText(
      '0 unmatched',
    );

    // Confirm Directory Scanner (Tab 3) also works completely offline under file://
    await page.getByTestId('tab-folder-mode').click();
    await page.getByTestId('folder-scan-input').setInputFiles(FIXTURES_DIR);
    await expect(page.getByTestId('folder-scan-report')).toBeVisible();
    expect(
      Number(await page.getByTestId('scan-total-findings').innerText()),
    ).toBeGreaterThanOrEqual(20);

    expect(pageErrors).toEqual([]);
    await context.close();
  });
});
