import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbMappingStore } from '@/storage/indexeddb-store';
import {
  KEYFILE_SECURITY_WARNING,
  KeyFileValidationError,
  getKeyFileName,
  parseAndValidateKeyFile,
  serializeKeyFile,
} from '@/storage/json-keyfile';
import { RemoteMappingStoreStub } from '@/storage/remote-store.stub';
import { createDefaultEngine } from '@/core/engine';
import type { MappingRecord } from '@/core/types';

function makeRecord(overrides: Partial<MappingRecord> = {}): MappingRecord {
  return {
    id: overrides.id ?? 'rec-1',
    schemaVersion: '1.0',
    sourceFileName: overrides.sourceFileName ?? 'Q3_Financial_Report.xlsx',
    sanitizedFileName:
      overrides.sanitizedFileName ?? 'Q3_Financial_Report_sanitized.xlsx',
    fileExt: overrides.fileExt ?? '.xlsx',
    createdAt: overrides.createdAt ?? '2026-11-26T14:30:00.000Z',
    entryCount: overrides.entries ? overrides.entries.length : 2,
    source: overrides.source ?? 'indexeddb',
    entries: overrides.entries ?? [
      {
        placeholder: '[EMAIL_1]',
        originalValue: 'alice@acme.com',
        ruleId: 'email',
        category: 'pii',
        count: 3,
      },
      {
        placeholder: '[IBAN_1]',
        originalValue: 'DE89 3704 0044 0532 0130 00',
        ruleId: 'iban',
        category: 'financial',
        count: 1,
      },
    ],
  };
}

describe('IndexedDbMappingStore & .json Keyfile Integration', () => {
  it('persists records bound to filenames, returns newest first, supports switching, deleting, and clearAll', async () => {
    const store = new IndexedDbMappingStore({
      dbName: `test-vault-${Date.now()}-${Math.random()}`,
    });
    await store.init();
    expect(store.kind).toBe('indexeddb');
    expect(store.isPersistent()).toBe(true);

    const older = makeRecord({
      id: 'rec-old',
      sourceFileName: 'Q2_Report.xlsx',
      sanitizedFileName: 'Q2_Report_sanitized.xlsx',
      createdAt: '2026-10-01T09:00:00.000Z',
    });
    const newer = makeRecord({
      id: 'rec-new',
      sourceFileName: 'Q3_Report.xlsx',
      sanitizedFileName: 'Q3_Report_sanitized.xlsx',
      createdAt: '2026-11-26T14:30:00.000Z',
    });

    await store.save(older);
    await store.save(newer);

    // Default latest is newest createdAt
    const latest = await store.getLatest();
    expect(latest?.id).toBe('rec-new');
    expect(latest?.sourceFileName).toBe('Q3_Report.xlsx');

    // Switch by id & list newest-first
    const all = await store.listAll();
    expect(all.map((r) => r.id)).toEqual(['rec-new', 'rec-old']);

    const switched = await store.getById('rec-old');
    expect(switched?.sourceFileName).toBe('Q2_Report.xlsx');

    // Delete single record
    await store.deleteById('rec-new');
    expect((await store.getLatest())?.id).toBe('rec-old');

    // Clear all
    await store.clearAll();
    expect(await store.listAll()).toEqual([]);
    expect(await store.getLatest()).toBeNull();

    store.close();
  });

  it('exports .json key file with security warning, survives vault clear, re-imports, and restores text accurately', async () => {
    const store = new IndexedDbMappingStore({
      dbName: `test-export-${Date.now()}-${Math.random()}`,
    });
    const engine = createDefaultEngine();
    const record = makeRecord({ id: 'rec-export' });

    await store.save(record);
    expect(getKeyFileName(record.sourceFileName)).toBe(
      'Q3_Financial_Report_key_map.json',
    );

    const exportedJson = serializeKeyFile(record);
    const parsedRaw = JSON.parse(exportedJson);
    expect(parsedRaw._security_warning).toBe(KEYFILE_SECURITY_WARNING);

    // Clear vault completely, then import from .json key file
    await store.clearAll();
    expect(await store.listAll()).toHaveLength(0);

    const imported = parseAndValidateKeyFile(exportedJson);
    expect(imported.source).toBe('imported_json');
    expect(imported.sourceFileName).toBe(record.sourceFileName);
    expect(imported.entries).toEqual(record.entries);

    await store.save(imported);
    const restored = engine.restoreText(
      'Send to [EMAIL_1] account [IBAN_1]',
      imported.entries,
    );
    expect(restored.restoredText).toBe(
      'Send to alice@acme.com account DE89 3704 0044 0532 0130 00',
    );
    expect(restored.diff.unmatchedCount).toBe(0);

    store.close();
  });

  it('rejects malformed or tampered .json key files safely', () => {
    expect(() => parseAndValidateKeyFile('not json {')).toThrow(
      KeyFileValidationError,
    );
    expect(() => parseAndValidateKeyFile('[]')).toThrow(KeyFileValidationError);

    const valid = JSON.parse(serializeKeyFile(makeRecord()));

    // Wrong schema version
    expect(() =>
      parseAndValidateKeyFile(JSON.stringify({ ...valid, schemaVersion: '2.0' })),
    ).toThrow(KeyFileValidationError);

    // Tampered entryCount mismatch
    expect(() =>
      parseAndValidateKeyFile(JSON.stringify({ ...valid, entryCount: 99 })),
    ).toThrow(KeyFileValidationError);

    // Invalid placeholder format
    expect(() =>
      parseAndValidateKeyFile(
        JSON.stringify({
          ...valid,
          entryCount: 1,
          entries: [{ ...valid.entries[0], placeholder: 'bad_placeholder' }],
        }),
      ),
    ).toThrow(KeyFileValidationError);

    // Duplicate placeholder
    expect(() =>
      parseAndValidateKeyFile(
        JSON.stringify({
          ...valid,
          entryCount: 2,
          entries: [valid.entries[0], valid.entries[0]],
        }),
      ),
    ).toThrow(KeyFileValidationError);
  });

  it('degrades gracefully to memory_fallback when IndexedDB is unavailable or blocked (file:// protection)', async () => {
    // 1. Missing indexedDB
    const nullStore = new IndexedDbMappingStore({ idbFactory: null });
    await nullStore.init();
    expect(nullStore.kind).toBe('memory_fallback');
    expect(nullStore.isPersistent()).toBe(false);

    await nullStore.save(makeRecord({ id: 'mem-1' }));
    expect((await nullStore.getLatest())?.id).toBe('mem-1');
    await nullStore.clearAll();
    expect(await nullStore.listAll()).toEqual([]);

    // 2. SecurityError thrown on open() (e.g. strict Safari file:// origin)
    const blockedFactory = {
      open() {
        throw new DOMException('SecurityError: IDB blocked on file://', 'SecurityError');
      },
    } as unknown as IDBFactory;

    const blockedStore = new IndexedDbMappingStore({
      idbFactory: blockedFactory,
    });
    await blockedStore.init();
    expect(blockedStore.kind).toBe('memory_fallback');
    expect(blockedStore.isPersistent()).toBe(false);
    await blockedStore.save(makeRecord({ id: 'mem-2' }));
    expect((await blockedStore.getById('mem-2'))?.id).toBe('mem-2');
  });

  it('keeps RemoteMappingStoreStub disabled in V1', async () => {
    const remote = new RemoteMappingStoreStub();
    expect(remote.kind).toBe('remote_sync');
    expect(remote.isPersistent()).toBe(false);
    await expect(remote.init()).rejects.toThrow();
  });
});
