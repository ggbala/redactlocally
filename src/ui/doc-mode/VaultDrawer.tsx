import { useState } from 'react';
import {
  ChevronDown,
  Database,
  Download,
  Trash2,
} from 'lucide-react';
import type { MappingRecord } from '@/core/types';
import { createKeyFileBlob, getKeyFileName } from '@/storage/json-keyfile';
import { downloadBlob, formatIsoDateTime } from '../utils/format';

interface VaultDrawerProps {
  records: readonly MappingRecord[];
  activeRecordId: string | null;
  isPersistent: boolean;
  onSelectForRestore: (id: string) => void;
  onDeleteRecord: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export function VaultDrawer({
  records,
  activeRecordId,
  isPersistent,
  onSelectForRestore,
  onDeleteRecord,
  onClearAll,
}: VaultDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const handleExport = (record: MappingRecord) => {
    downloadBlob(
      createKeyFileBlob(record),
      getKeyFileName(record.sourceFileName),
    );
  };

  const handleClearConfirm = async () => {
    await onClearAll();
    setConfirmClearAll(false);
  };

  return (
    <div
      data-testid="local-mapping-vault"
      className="border-t border-[#E5E7EB] bg-[#FAFAFB]"
    >
      {/* Collapsed Header Bar */}
      <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[#374151]">
          <Database className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
          <span className="font-medium text-[#111827]">Local Mapping Vault</span>
          <span className="text-[#6B7280]">
            ({isPersistent ? 'IndexedDB · Local device only' : 'Session Memory Fallback · Export .json to keep'}
            , {records.length} saved)
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid="toggle-vault-drawer-btn"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-[#374151] hover:text-[#111827] hover:bg-[#E5E7EB]/60 transition-colors cursor-pointer"
        >
          <span>{expanded ? 'Collapse' : 'Expand'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {/* Expanded Management Table */}
      {expanded && (
        <div
          data-testid="vault-drawer-body"
          className="border-t border-[#E5E7EB] bg-white px-4 sm:px-5 py-3.5 space-y-3"
        >
          {records.length === 0 ? (
            <p className="text-xs text-[#6B7280] py-2 text-center">
              No saved document mappings yet. Sanitize a file or import a{' '}
              <code className="font-mono">.json</code> key file to populate your local vault.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#6B7280]">
                  Stored locally in your browser. Never synced or uploaded.
                </span>

                {confirmClearAll ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#991B1B] font-medium">
                      Delete all {records.length} maps?
                    </span>
                    <button
                      type="button"
                      onClick={handleClearConfirm}
                      data-testid="confirm-clear-vault-btn"
                      className="px-2.5 py-1 rounded bg-[#DC2626] text-white font-medium hover:bg-[#B91C1C] cursor-pointer"
                    >
                      Confirm Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="px-2 py-1 rounded border border-[#D1D5DB] text-[#374151] hover:bg-[#F3F4F6] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    data-testid="clear-vault-btn"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626] hover:text-[#991B1B] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAFAFB] border-b border-[#E5E7EB] text-[#6B7280]">
                    <tr>
                      <th className="py-2 px-3 font-medium">File Name</th>
                      <th className="py-2 px-3 font-medium">Date &amp; Time</th>
                      <th className="py-2 px-3 font-medium">Items</th>
                      <th className="py-2 px-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {records.map((rec) => {
                      const isActive = rec.id === activeRecordId;
                      return (
                        <tr
                          key={rec.id}
                          className={isActive ? 'bg-[#EEF2FF]/40' : 'bg-white'}
                        >
                          <td className="py-2 px-3 font-medium text-[#111827] max-w-[260px] truncate">
                            {rec.sourceFileName}
                          </td>
                          <td className="py-2 px-3 font-mono text-[#6B7280] whitespace-nowrap">
                            {formatIsoDateTime(rec.createdAt)}
                          </td>
                          <td className="py-2 px-3 font-mono text-[#374151]">
                            {rec.entryCount}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onSelectForRestore(rec.id)}
                                className="px-2 py-1 rounded border border-[#D1D5DB] bg-white text-[11px] font-medium text-[#111827] hover:bg-[#F3F4F6] cursor-pointer"
                              >
                                {isActive ? 'Selected' : 'Select'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExport(rec)}
                                title="Export .json key file"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#D1D5DB] bg-white text-[11px] font-medium text-[#374151] hover:bg-[#F3F4F6] cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>.json</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void onDeleteRecord(rec.id)}
                                title="Delete mapping"
                                aria-label={`Delete ${rec.sourceFileName}`}
                                className="p-1 rounded text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
