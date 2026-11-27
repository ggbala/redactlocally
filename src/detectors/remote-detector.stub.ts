import type {
  DetectedEntity,
  DetectionContext,
  DetectorProvider,
} from '../core/types';

/**
 * Reserved V2+ extension seam for optional enterprise/team backend detection API.
 * Never invoked in V1 (Zero Network Egress iron rule).
 */
export class RemoteApiDetectorStub implements DetectorProvider {
  readonly id = 'remote-api-detector-stub';
  readonly kind = 'remote_api' as const;

  isReady(): boolean {
    return false;
  }

  async init(): Promise<void> {
    throw new Error(
      'Remote API detector is disabled in V1 (100% local offline mode).',
    );
  }

  detect(
    _text: string,
    _context?: DetectionContext,
  ): DetectedEntity[] {
    return [];
  }
}
