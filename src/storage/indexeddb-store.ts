import type { MappingRecord } from '../core/types';
import type { MappingStore } from './types';

const DEFAULT_DB_NAME = 'local-sanitize-vault';
const STORE_NAME = 'mappings';
const DB_VERSION = 1;

function cloneRecord(record: MappingRecord): MappingRecord {
  return {
    ...record,
    entries: record.entries.map((e) => ({ ...e })),
  };
}

function sortByNewest(records: MappingRecord[]): MappingRecord[] {
  return [...records].sort((a, b) => {
    const timeDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (timeDiff !== 0 && Number.isFinite(timeDiff)) {
      return timeDiff;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Document Mode local vault backed by browser IndexedDB.
 * Automatically probes IndexedDB availability and degrades gracefully to an in-memory
 * fallback store when opened in restricted `file://` or private browsing environments.
 */
export class IndexedDbMappingStore implements MappingStore {
  private readonly dbName: string;
  private readonly idbFactory: IDBFactory | null;
  private db: IDBDatabase | null = null;
  private fallbackMemory = new Map<string, MappingRecord>();
  private initialized = false;
  private _kind: 'indexeddb' | 'memory_fallback' = 'indexeddb';

  constructor(
    options: { dbName?: string; idbFactory?: IDBFactory | null } = {},
  ) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.idbFactory =
      options.idbFactory !== undefined
        ? options.idbFactory
        : typeof globalThis !== 'undefined' && 'indexedDB' in globalThis
          ? globalThis.indexedDB
          : null;
  }

  get kind(): 'indexeddb' | 'memory_fallback' {
    return this._kind;
  }

  isPersistent(): boolean {
    return this._kind === 'indexeddb';
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.idbFactory) {
      this._kind = 'memory_fallback';
      this.initialized = true;
      return;
    }

    try {
      this.db = await this.openDatabase(this.idbFactory);
      this._kind = 'indexeddb';
    } catch {
      // Graceful fallback for file:// restrictions (e.g. Safari) or blocked storage
      this.db = null;
      this._kind = 'memory_fallback';
    }

    this.initialized = true;
  }

  private openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(this.dbName, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to open IndexedDB.'));
      request.onblocked = () =>
        reject(new Error('IndexedDB open request was blocked.'));
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  async save(record: MappingRecord): Promise<void> {
    await this.ensureInitialized();
    const copy = cloneRecord(record);

    if (!this.db) {
      this.fallbackMemory.set(copy.id, copy);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(copy);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('Failed to save mapping record.'));
    });
  }

  async getById(id: string): Promise<MappingRecord | null> {
    await this.ensureInitialized();

    if (!this.db) {
      const found = this.fallbackMemory.get(id);
      return found ? cloneRecord(found) : null;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const result = req.result as MappingRecord | undefined;
        resolve(result ? cloneRecord(result) : null);
      };
      req.onerror = () =>
        reject(req.error ?? new Error('Failed to read mapping record.'));
    });
  }

  async listAll(): Promise<MappingRecord[]> {
    await this.ensureInitialized();

    if (!this.db) {
      return sortByNewest(
        Array.from(this.fallbackMemory.values()).map(cloneRecord),
      );
    }

    const records = await new Promise<MappingRecord[]>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as MappingRecord[] | undefined) ?? [];
        resolve(list.map(cloneRecord));
      };
      req.onerror = () =>
        reject(req.error ?? new Error('Failed to list mapping records.'));
    });

    return sortByNewest(records);
  }

  async getLatest(): Promise<MappingRecord | null> {
    const all = await this.listAll();
    return all.length > 0 ? all[0] : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.db) {
      this.fallbackMemory.delete(id);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('Failed to delete mapping record.'));
    });
  }

  async clearAll(): Promise<void> {
    await this.ensureInitialized();

    if (!this.db) {
      this.fallbackMemory.clear();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('Failed to clear mapping vault.'));
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.initialized = false;
  }
}
