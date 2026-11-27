import type { MappingRecord } from '../core/types';
import type { MappingStore } from './types';

/**
 * Reserved V2+ extension seam for optional encrypted team/backend mapping vault sync.
 * Strictly disabled in V1 (Zero Network Egress iron rule).
 */
export class RemoteMappingStoreStub implements MappingStore {
  readonly kind = 'remote_sync' as const;

  isPersistent(): boolean {
    return false;
  }

  async init(): Promise<void> {
    throw new Error(
      'Remote team mapping store is reserved for V2+ and disabled in V1 local-only mode.',
    );
  }

  async save(_record: MappingRecord): Promise<void> {
    throw new Error('Remote team mapping store is disabled in V1.');
  }

  async getById(_id: string): Promise<MappingRecord | null> {
    throw new Error('Remote team mapping store is disabled in V1.');
  }

  async getLatest(): Promise<MappingRecord | null> {
    throw new Error('Remote team mapping store is disabled in V1.');
  }

  async listAll(): Promise<MappingRecord[]> {
    throw new Error('Remote team mapping store is disabled in V1.');
  }

  async deleteById(_id: string): Promise<void> {
    throw new Error('Remote team mapping store is disabled in V1.');
  }

  async clearAll(): Promise<void> {
    throw new Error('Remote team mapping store is disabled in V1.');
  }
}
