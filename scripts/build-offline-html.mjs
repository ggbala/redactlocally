import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'dist-offline');
const BUILT_INDEX = path.join(OUT_DIR, 'index.html');
const TARGET_FILE = path.join(OUT_DIR, 'local-sanitizer-offline.html');
const FAVICON_PATH = path.join(ROOT_DIR, 'public', 'favicon.svg');

async function buildOfflineHtml() {
  console.log('[build:offline] Building standalone single-HTML bundle...');

  await build({
    configFile: path.join(ROOT_DIR, 'vite.offline.config.ts'),
    root: ROOT_DIR,
  });

  if (!fs.existsSync(BUILT_INDEX)) {
    throw new Error(`Expected single-file output not found at ${BUILT_INDEX}`);
  }

  let html = fs.readFileSync(BUILT_INDEX, 'utf-8');

  // 1. Remove <link rel="canonical" ...> so offline copies never compete with live SEO canonical
  html = html.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>\s*/gi, '');

  // 2. Remove any existing robots meta tag and inject noindex, nofollow right after <head>
  html = html.replace(/<meta\s+[^>]*name=["']robots["'][^>]*>\s*/gi, '');
  html = html.replace(
    /<head([^>]*)>/i,
    '<head$1>\n    <meta name="robots" content="noindex, nofollow" />',
  );

  // 3. Inline public/favicon.svg as a data URI so file:// mode makes zero external requests
  if (fs.existsSync(FAVICON_PATH)) {
    const svgContent = fs.readFileSync(FAVICON_PATH, 'utf-8').trim();
    const encodedSvg = Buffer.from(svgContent, 'utf-8').toString('base64');
    const dataUri = `data:image/svg+xml;base64,${encodedSvg}`;
    html = html.replace(
      /<link\s+[^>]*rel=["']icon["'][^>]*href=["']\/favicon\.svg["'][^>]*>/i,
      `<link rel="icon" type="image/svg+xml" href="${dataUri}" />`,
    );
  }

  // 4. Integrity assertions (Iron Rules: zero external runtime assets + SEO isolation)
  if (!/<meta\s+name=["']robots["']\s+content=["']noindex,\s*nofollow["']\s*\/?>/i.test(html)) {
    throw new Error('[build:offline] Verification failed: missing noindex, nofollow meta tag.');
  }
  if (/rel=["']canonical["']/i.test(html)) {
    throw new Error('[build:offline] Verification failed: canonical link was not removed.');
  }

  // Check <head> for any external script/stylesheet/font/icon references
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headHtml = headMatch ? headMatch[1] : '';
  const externalAssetPatterns = [
    /<script[^>]+src=["'][^"']+["']/i,
    /<link[^>]+rel=["']stylesheet["'][^>]+href=["'][^"']+["']/i,
    /fonts\.googleapis\.com/i,
    /fonts\.gstatic\.com/i,
    /cdn\.jsdelivr\.net/i,
    /unpkg\.com/i,
    /cdnjs\.cloudflare\.com/i,
  ];
  for (const pattern of externalAssetPatterns) {
    if (pattern.test(headHtml)) {
      throw new Error(
        `[build:offline] Verification failed: external asset reference matched ${pattern} in <head>.`,
      );
    }
  }

  // Write final standalone file and clean up intermediate index.html
  fs.writeFileSync(TARGET_FILE, html, 'utf-8');
  fs.unlinkSync(BUILT_INDEX);

  const sizeKB = (fs.statSync(TARGET_FILE).size / 1024).toFixed(1);
  console.log(`[build:offline] Success! Wrote ${path.relative(ROOT_DIR, TARGET_FILE)} (${sizeKB} KB)`);
}

buildOfflineHtml().catch((err) => {
  console.error(err);
  process.exit(1);
});
