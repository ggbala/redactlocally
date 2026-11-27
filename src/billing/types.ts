export type FeatureKey =
  | 'text_sanitize'
  | 'doc_sanitize_basic'
  | 'local_slm_ner'
  | 'pdf_redaction'
  | 'batch_documents'
  | 'team_cloud_sync';

export type LimitKey = 'maxFileSizeMB' | 'maxVaultRecords';

export interface LicenseState {
  tier: 'free' | 'pro' | 'team';
  valid: boolean;
  licenseKey?: string;
}

export interface EntitlementProvider {
  canUse(feature: FeatureKey): boolean;
  getLimit(limitKey: LimitKey): number;
  getLicenseState(): LicenseState;
  activateLicense?(key: string): Promise<{ valid: boolean; tier: string }>;
}
