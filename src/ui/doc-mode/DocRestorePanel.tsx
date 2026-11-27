import { useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileUp,
  KeyRound,
  Loader2,
  Upload,
} from 'lucide-react';
import type { MappingRecord } from '@/core/types';
import { defaultHandlerRegistry } from '@/handlers/registry';
import type { DocumentRestoreResult } from '@/handlers/types';
import { getFileExtension, readFileAsText } from '@/handlers/utils';
import {
  createKeyFileBlob,
  getKeyFileName,
  parseAndValidateKeyFile,
} from '@/storage/json-keyfile';
import { downloadBlob, formatIsoDateTime } from '../utils/format';
import { DiffReport } from './DiffReport';

interface DocRestorePanelProps {
  vaultRecords: readonly MappingRecord[];
  activeRecord: MappingRecord | null;
  onSelectRecord: (id: string) => void;
  onImportKeyFile: (record: MappingRecord) => Promise<void>;
  onGoToSanitize: () => void;
}

function getDynamicDownloadLabel(fileName: string): string {
  const ext = getFileExtension(fileName);
  if (ext === '.xlsx' || ext === '.xls') {
    return 'Download Restored Excel File';
  }
  if (ext === '.csv') {
    return 'Download Restored CSV File';
  }
  if (ext === '.docx') {
    return 'Download Restored Word File';
  }
  return 'Download Restored File';
}

export function DocRestorePanel({
  vaultRecords,
  activeRecord,
  onSelectRecord,
  onImportKeyFile,
  onGoToSanitize,
}: DocRestorePanelProps) {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [switchOpen, setSwitchOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [crossExtWarning, setCrossExtWarning] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [result, setResult] = useState<DocumentRestoreResult | null>(null);

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    try {
      const text = await readFileAsText(file);
      const record = parseAndValidateKeyFile(text);
      await onImportKeyFile(record);
      setResult(null);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to import key map file.',
      );
    }
  };

  const handleExportActiveMap = () => {
    if (!activeRecord) return;
    const blob = createKeyFileBlob(activeRecord);
    downloadBlob(blob, getKeyFileName(activeRecord.sourceFileName));
  };

  const handleRestoreFile = async (file: File) => {
    if (!activeRecord) {
      setRestoreError(
        'Select or import a mapping table in Step 1 before uploading an AI-processed file.',
      );
      return;
    }

    setRestoreError(null);
    setCrossExtWarning(null);
    setResult(null);
    setIsRestoring(true);

    try {
      const handler = defaultHandlerRegistry.resolveOrThrow(file.name);
      const uploadedExt = getFileExtension(file.name);
      if (
        uploadedExt &&
        activeRecord.fileExt &&
        uploadedExt !== activeRecord.fileExt.toLowerCase()
      ) {
        setCrossExtWarning(
          `Note: Active map was created from ${activeRecord.fileExt}, while uploaded file is ${uploadedExt}. Please verify results below.`,
        );
      }

      const restored = await handler.restore(file, activeRecord);
      setResult(restored);
    } catch (err) {
      setRestoreError(
        err instanceof Error
          ? err.message
          : 'Unable to restore this file locally.',
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDocInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleRestoreFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleRestoreFile(file);
    }
  };

  return (
    <div data-testid="doc-restore-panel" className="p-4 sm:p-6 space-y-6">
      {/* Step 1: Confirm Active Local Mapping Table */}
      <div className="space-y-2.5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#111827]">
            Step 1: Confirm Local Mapping Table
          </h3>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Auto-selects your most recent map; switch from the local vault or import a{' '}
            <code className="font-mono">.json</code> key file.
          </p>
        </div>

        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          data-testid="import-keyfile-input"
          onChange={handleImportJson}
          className="hidden"
        />

        <div className="relative rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] p-4 space-y-3">
          {activeRecord ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] text-[#3730A3] flex items-center justify-center shrink-0 mt-0.5">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div
                    data-testid="active-map-name"
                    className="text-sm font-semibold text-[#111827] truncate"
                  >
                    Active Map: {activeRecord.sanitizedFileName}
                  </div>
                  <div className="text-xs text-[#6B7280] font-mono mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{formatIsoDateTime(activeRecord.createdAt)}</span>
                    <span>&middot;</span>
                    <span>
                      {activeRecord.entryCount}{' '}
                      {activeRecord.entryCount === 1 ? 'rule' : 'rules'}
                    </span>
                    <span>&middot;</span>
                    <span>
                      Source:{' '}
                      {activeRecord.source === 'imported_json'
                        ? 'Imported .json'
                        : 'IndexedDB'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {vaultRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSwitchOpen((v) => !v)}
                    data-testid="switch-map-btn"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D1D5DB] text-xs font-medium text-[#111827] hover:bg-[#F3F4F6] cursor-pointer"
                  >
                    <span>Switch</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExportActiveMap}
                  data-testid="export-active-map-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D1D5DB] text-xs font-medium text-[#111827] hover:bg-[#F3F4F6] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#6B7280]" />
                  <span>Export Map (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={() => jsonInputRef.current?.click()}
                  data-testid="import-map-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D1D5DB] text-xs font-medium text-[#111827] hover:bg-[#F3F4F6] cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#6B7280]" />
                  <span>Import .json</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#6B7280]">
                No local mapping tables found in this browser yet. Sanitize a document first or import an existing{' '}
                <code className="font-mono">.json</code> key map.
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onGoToSanitize}
                  className="px-3 py-1.5 rounded-lg bg-[#18181B] text-white text-xs font-medium hover:bg-[#27272A] cursor-pointer"
                >
                  Go to Sanitize File
                </button>
                <button
                  type="button"
                  onClick={() => jsonInputRef.current?.click()}
                  data-testid="import-map-btn"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#D1D5DB] text-xs font-medium text-[#111827] hover:bg-[#F3F4F6] cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import .json</span>
                </button>
              </div>
            </div>
          )}

          {/* Switch Dropdown */}
          {switchOpen && vaultRecords.length > 0 && (
            <div
              data-testid="switch-map-dropdown"
              className="mt-2 rounded-lg border border-[#E5E7EB] bg-white shadow-md divide-y divide-[#F3F4F6] max-h-56 overflow-y-auto"
            >
              {vaultRecords.map((rec) => {
                const selected = rec.id === activeRecord?.id;
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => {
                      onSelectRecord(rec.id);
                      setSwitchOpen(false);
                      setResult(null);
                    }}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#EEF2FF]/70 text-[#111827]'
                        : 'hover:bg-[#FAFAFB] text-[#374151]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {rec.sourceFileName}
                      </div>
                      <div className="text-[11px] font-mono text-[#6B7280]">
                        {formatIsoDateTime(rec.createdAt)} &middot;{' '}
                        {rec.entryCount} items
                      </div>
                    </div>
                    {selected && (
                      <span className="text-[11px] font-medium text-[#3730A3] shrink-0">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {importError && (
          <div
            role="alert"
            data-testid="import-keyfile-error"
            className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 flex items-start gap-2.5 text-xs text-[#991B1B]"
          >
            <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
            <span>{importError}</span>
          </div>
        )}
      </div>

      {/* Step 2: Upload AI-Processed File */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#111827]">
          Step 2: Upload AI-Processed File (.xlsx / .csv / .docx / .txt / code)
        </h3>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => activeRecord && docInputRef.current?.click()}
          data-testid="doc-restore-dropzone"
          className={`rounded-xl border-2 border-dashed p-7 text-center transition-colors ${
            !activeRecord
              ? 'border-[#E5E7EB] bg-[#F9FAFB] opacity-60 cursor-not-allowed'
              : isDragging
                ? 'border-[#0F766E] bg-[#F0FDFA] cursor-pointer'
                : 'border-[#D1D5DB] bg-[#FAFAFB] hover:border-[#9CA3AF] cursor-pointer'
          }`}
        >
          <input
            ref={docInputRef}
            type="file"
            disabled={!activeRecord}
            data-testid="doc-restore-file-input"
            accept={`${defaultHandlerRegistry.getAcceptAttribute()},.pdf`}
            onChange={handleDocInputChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-2">
            {isRestoring ? (
              <>
                <Loader2 className="w-6 h-6 text-[#0F766E] animate-spin" />
                <p className="text-sm font-medium text-[#111827]">
                  Restoring original values locally...
                </p>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-[#F0FDFA] border border-[#99F6E4] flex items-center justify-center shadow-2xs">
                  <FileUp className="w-4.5 h-4.5 text-[#0F766E]" />
                </div>
                <p className="text-sm font-medium text-[#111827]">
                  Drag &amp; drop AI output file containing placeholders, or click
                </p>
                <p className="text-xs text-[#6B7280]">
                  Preserves original formulas, column widths &amp; basic formatting
                </p>
              </>
            )}
          </div>
        </div>

        {crossExtWarning && (
          <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2.5 flex items-start gap-2 text-xs text-[#92400E]">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <span>{crossExtWarning}</span>
          </div>
        )}

        {restoreError && (
          <div
            role="alert"
            data-testid="doc-restore-error"
            className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 flex items-start gap-2.5 text-xs text-[#991B1B]"
          >
            <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
            <span>{restoreError}</span>
          </div>
        )}
      </div>

      {/* Step 3: Restoration Result & Verification Diff */}
      {result && (
        <div
          data-testid="doc-restore-result"
          className="space-y-3 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]/60 p-4 sm:p-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-sm font-semibold text-[#065F46]">
              <CheckCircle2 className="w-4.5 h-4.5 text-[#10B981] shrink-0 mt-0.5" />
              <span data-testid="doc-restore-summary">
                Restoration complete: {result.diff.replacedCount}{' '}
                {result.diff.replacedCount === 1
                  ? 'placeholder'
                  : 'placeholders'}{' '}
                replaced ({result.diff.unmatchedCount} unmatched
                {result.diff.unknownCount > 0
                  ? ` · ${result.diff.unknownCount} unknown`
                  : ''}
                )
              </span>
            </div>

            <button
              type="button"
              onClick={() => downloadBlob(result.blob, result.restoredFileName)}
              data-testid="download-restored-doc-btn"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F766E] text-white text-xs font-medium hover:bg-[#115E59] transition-colors shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{getDynamicDownloadLabel(result.restoredFileName)}</span>
            </button>
          </div>

          <DiffReport diff={result.diff} />
        </div>
      )}
    </div>
  );
}
