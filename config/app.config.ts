export interface AppConfig {
  readonly brandName: string;
  readonly tagline: string;
  readonly description: string;
  readonly version: string;
  readonly siteUrl: string;
  readonly githubRepoUrl: string;
  readonly offlineReleaseUrl: string;
  readonly offlineBundleFilename: string;
  readonly license: string;
  readonly licenseUrl: string;
}

/**
 * Centralized application metadata, domain, and open-source links.
 * Update siteUrl and githubRepoUrl before production deployment.
 */
export const APP_CONFIG: AppConfig = {
  brandName: 'RedactLocally',
  tagline: 'Free Local Offline AI Data & Document Sanitizer',
  description:
    '100% offline, open-source tool to anonymize text, code, Excel, and Word documents before pasting into ChatGPT or Claude. Zero server uploads. Reversible placeholders.',
  version: '1.0.0',
  siteUrl: 'https://redactlocally.com',
  githubRepoUrl: 'https://github.com/ggbala/redactlocally',
  offlineReleaseUrl:
    'https://github.com/ggbala/redactlocally/releases/latest',
  offlineBundleFilename: 'local-sanitizer-offline.html',
  license: 'MIT',
  licenseUrl: 'https://github.com/ggbala/redactlocally/blob/main/LICENSE',
};
