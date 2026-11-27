import type {
  DetectedEntity,
  DetectionContext,
  DetectorProvider,
} from '../core/types';

/**
 * Reserved V2+ extension seam for local in-browser Small Language Model / ONNX NER
 * (e.g., WebGPU / WASM person & organization entity recognition).
 * V1 remains 100% deterministic regex/validator-driven with zero model downloads.
 */
export class LocalSlmDetectorStub implements DetectorProvider {
  readonly id = 'local-slm-ner-stub';
  readonly kind = 'local_slm' as const;

  isReady(): boolean {
    return false;
  }

  async init(onProgress?: (pct: number) => void): Promise<void> {
    onProgress?.(0);
    throw new Error(
      'Local SLM NER detector is reserved for V2 and is not enabled in V1.',
    );
  }

  detect(
    _text: string,
    _context?: DetectionContext,
  ): DetectedEntity[] {
    return [];
  }
}
