import type { MappingEntry, MappingRecord } from '../core/types';

export interface TextMappingSnapshot {
  createdAt: string;
  displayTime: string;
  entries: MappingEntry[];
  entryCount: number;
  totalReplacements: number;
  categoryCounts: Record<string, number>;
}

export interface TextMappingStore {
  getCurrent(): TextMappingSnapshot | null;
  overwrite(snapshot: TextMappingSnapshot): void;
  clear(): void;
}

export interface MappingStore {
  readonly kind: 'indexeddb' | 'memory_fallback' | 'remote_sync';
  isPersistent(): boolean;
  init(): Promise<void>;
  save(record: MappingRecord): Promise<void>;
  getById(id: string): Promise<MappingRecord | null>;
  getLatest(): Promise<MappingRecord | null>;
  listAll(): Promise<MappingRecord[]>;
  deleteById(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface ExportedKeyFile {
  _security_warning: string;
  schemaVersion: '1.0';
  id: string;
  sourceFileName: string;
  sanitizedFileName: string;
  fileExt: string;
  createdAt: string;
  entryCount: number;
  entries: MappingEntry[];
}
