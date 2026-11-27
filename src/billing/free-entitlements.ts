import type {
  EntitlementProvider,
  FeatureKey,
  LicenseState,
  LimitKey,
} from './types';

const V1_FREE_FEATURES: ReadonlySet<FeatureKey> = new Set([
  'text_sanitize',
  'doc_sanitize_basic',
]);

const V1_FREE_LIMITS: Record<LimitKey, number> = {
  maxFileSizeMB: 50,
  maxVaultRecords: 200,
};

/**
 * Default V1 EntitlementProvider: all V1 local features are free and unrestricted,
 * while V2+ Pro/Team features remain cleanly gated for future license activation.
 */
export class FreeEntitlementProvider implements EntitlementProvider {
  canUse(feature: FeatureKey): boolean {
    return V1_FREE_FEATURES.has(feature);
  }

  getLimit(limitKey: LimitKey): number {
    return V1_FREE_LIMITS[limitKey];
  }

  getLicenseState(): LicenseState {
    return {
      tier: 'free',
      valid: true,
    };
  }

  async activateLicense(_key: string): Promise<{ valid: boolean; tier: string }> {
    return {
      valid: false,
      tier: 'free',
    };
  }
}

export const defaultEntitlements: EntitlementProvider =
  new FreeEntitlementProvider();
