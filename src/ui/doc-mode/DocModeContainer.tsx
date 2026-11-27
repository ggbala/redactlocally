import { useCallback, useEffect, useRef, useState } from 'react';
import { FileCheck2, Shield } from 'lucide-react';
import type { SanitizationEngine } from '@/core/engine';
import type { CustomRule, MappingRecord } from '@/core/types';
import { IndexedDbMappingStore } from '@/storage/indexeddb-store';
import { DocSanitizePanel } from './DocSanitizePanel';
import { DocRestorePanel } from './DocRestorePanel';
import { VaultDrawer } from './VaultDrawer';

type DocSubTab = 'sanitize' | 'restore';

interface DocModeContainerProps {
  engine: SanitizationEngine;
  enabledRuleIds: ReadonlySet<string>;
  customRules: readonly CustomRule[];
}

export function DocModeContainer({
  engine,
  enabledRuleIds,
  customRules,
}: DocModeContainerProps) {
  const storeRef = useRef<IndexedDbMappingStore>(new IndexedDbMappingStore());

  const [subTab, setSubTab] = useState<DocSubTab>('sanitize');
  const [vaultRecords, setVaultRecords] = useState<MappingRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [isPersistent, setIsPersistent] = useState<boolean>(true);

  const refreshVault = useCallback(async (preferredId?: string) => {
    const store = storeRef.current;
    await store.init();
    setIsPersistent(store.isPersistent());
    const all = await store.listAll();
    setVaultRecords(all);

    setActiveRecordId((currentId) => {
      if (preferredId && all.some((r) => r.id === preferredId)) {
        return preferredId;
      }
      if (currentId && all.some((r) => r.id === currentId)) {
        return currentId;
      }
      return all.length > 0 ? all[0].id : null;
    });
  }, []);

  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  const handleSanitizeComplete = async (record: MappingRecord) => {
    await storeRef.current.save(record);
    await refreshVault(record.id);
  };

  const handleImportKeyFile = async (record: MappingRecord) => {
    await storeRef.current.save(record);
    await refreshVault(record.id);
  };

  const handleDeleteRecord = async (id: string) => {
    await storeRef.current.deleteById(id);
    await refreshVault();
  };

  const handleClearAll = async () => {
    await storeRef.current.clearAll();
    await refreshVault();
  };

  const activeRecord =
    vaultRecords.find((r) => r.id === activeRecordId) ??
    vaultRecords[0] ??
    null;

  return (
    <section
      aria-label="Document Sanitizer Workspace"
      data-testid="doc-workspace"
      className="w-full rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05),0_10px_28px_-12px_rgba(15,23,42,0.08)] overflow-hidden"
    >
      {/* Internal 2-Step Navigation Bar (Full-Width Equal Split) */}
      <div
        role="tablist"
        aria-label="Document workflow steps"
        className="grid grid-cols-1 sm:grid-cols-2 border-b border-[#E2E8F0] bg-[#F8FAFC]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'sanitize'}
          data-testid="doc-subtab-sanitize"
          onClick={() => setSubTab('sanitize')}
          className={`flex items-center justify-center gap-2 py-3.5 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            subTab === 'sanitize'
              ? 'border-[#2563EB] bg-white text-[#1D4ED8]'
              : 'border-transparent text-[#475569] hover:text-[#0F172A] hover:bg-white/70'
          }`}
        >
          <Shield
            className={`w-4 h-4 shrink-0 ${
              subTab === 'sanitize' ? 'text-[#2563EB]' : 'text-[#64748B]'
            }`}
          />
          <span>1. Sanitize File (Clean + Save local map)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'restore'}
          data-testid="doc-subtab-restore"
          onClick={() => setSubTab('restore')}
          className={`flex items-center justify-center gap-2 py-3.5 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer sm:border-l sm:border-l-[#E2E8F0] ${
            subTab === 'restore'
              ? 'border-[#0F766E] bg-white text-[#0F766E]'
              : 'border-transparent text-[#475569] hover:text-[#0F172A] hover:bg-white/70'
          }`}
        >
          <FileCheck2
            className={`w-4 h-4 shrink-0 ${
              subTab === 'restore' ? 'text-[#0F766E]' : 'text-[#64748B]'
            }`}
          />
          <span>2. Restore File (Map + AI File)</span>
        </button>
      </div>

      {/* Active Document Workflow View */}
      {subTab === 'sanitize' ? (
        <DocSanitizePanel
          engine={engine}
          enabledRuleIds={enabledRuleIds}
          customRules={customRules}
          isVaultPersistent={isPersistent}
          onSanitizeComplete={handleSanitizeComplete}
          onGoToRestore={(id) => {
            setActiveRecordId(id);
            setSubTab('restore');
          }}
        />
      ) : (
        <DocRestorePanel
          vaultRecords={vaultRecords}
          activeRecord={activeRecord}
          onSelectRecord={(id) => setActiveRecordId(id)}
          onImportKeyFile={handleImportKeyFile}
          onGoToSanitize={() => setSubTab('sanitize')}
        />
      )}

      {/* Restrained Collapsible Bottom Drawer: Local Mapping Vault */}
      <VaultDrawer
        records={vaultRecords}
        activeRecordId={activeRecord?.id ?? null}
        isPersistent={isPersistent}
        onSelectForRestore={(id) => {
          setActiveRecordId(id);
          setSubTab('restore');
        }}
        onDeleteRecord={handleDeleteRecord}
        onClearAll={handleClearAll}
      />
    </section>
  );
}
