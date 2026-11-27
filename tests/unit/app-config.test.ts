import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '@config/app.config';

describe('APP_CONFIG', () => {
  it('defines valid brand metadata, siteUrl, GitHub repo URL, and MIT license', () => {
    expect(APP_CONFIG.brandName.length).toBeGreaterThan(0);
    expect(APP_CONFIG.siteUrl).toMatch(/^https:\/\//);
    expect(APP_CONFIG.githubRepoUrl).toMatch(/^https:\/\/github\.com\//);
    expect(APP_CONFIG.license).toBe('MIT');
    expect(APP_CONFIG.offlineBundleFilename).toBe('local-sanitizer-offline.html');
  });
});
