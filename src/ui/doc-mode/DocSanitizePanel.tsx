import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  FileUp,
  KeyRound,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import type { SanitizationEngine } from '@/core/engine';
import type { CustomRule, MappingRecord } from '@/core/types';
import { defaultHandlerRegistry } from '@/handlers/registry';
import type { DocumentSanitizeResult } from '@/handlers/types';
import { createKeyFileBlob, getKeyFileName } from '@/storage/json-keyfile';
import { CATEGORY_LABELS, downloadBlob } from '../utils/format';

interface DocSanitizePanelProps {
  engine: SanitizationEngine;
  enabledRuleIds: ReadonlySet<string>;
  customRules: readonly CustomRule[];
  isVaultPersistent: boolean;
  onSanitizeComplete: (record: MappingRecord) => Promise<void>;
  onGoToRestore: (recordId: string) => void;
}

export function DocSanitizePanel({
  engine,
  enabledRuleIds,
  customRules,
  isVaultPersistent,
  onSanitizeComplete,
  onGoToRestore,
}: DocSanitizePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stripMetadata, setStripMetadata] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [result, setResult] = useState<DocumentSanitizeResult | null>(null);

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setResult(null);
    setIsProcessing(true);

    try {
      const handler = defaultHandlerRegistry.resolveOrThrow(file.name);
      const sanitized = await handler.sanitize(file, engine, {
        enabledRuleIds,
        customRules,
        stripMetadata,
      });

      await onSanitizeComplete(sanitized.mapping);
      setResult(sanitized);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to process this file locally. Please check the file format and try again.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleDownloadSanitized = () => {
    if (!result) return;
    downloadBlob(result.blob, result.sanitizedFileName);
  };

  const handleExportKeyMap = () => {
    if (!result) return;
    const blob = createKeyFileBlob(result.mapping);
    downloadBlob(blob, getKeyFileName(result.mapping.sourceFileName));
  };

  const categoryEntries = result
    ? Object.entries(result.categoryCounts).filter(([, c]) => c > 0)
    : [];

  return (
    <div data-testid="doc-sanitize-panel" className="p-4 sm:p-6 space-y-5">
      {/* Step 1: Upload Zone */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#111827]">
            Step 1: Upload Original Document (100% Local Browser Parsing)
          </h3>

          {/* Collapsible Privacy Options */}
          <button
            type="button"
            onClick={() => setOptionsOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#111827] cursor-pointer"
          >
            <span>Privacy Options</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${
                optionsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {optionsOpen && (
          <div className="px-3.5 py-2.5 rounded-xl bg-[#FAFAFB] border border-[#E5E7EB] text-xs text-[#374151]">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stripMetadata}
                onChange={(e) => setStripMetadata(e.target.checked)}
                data-testid="strip-metadata-checkbox"
                className="rounded border-[#D1D5DB]"
              />
              <span>
                Strip document metadata (Author / Company / Last Modified By) for{' '}
                <code className="font-mono text-[11px]">.docx</code> and{' '}
                <code className="font-mono text-[11px]">.xlsx</code>
              </span>
            </label>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          data-testid="doc-sanitize-dropzone"
          className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-[#2563EB] bg-[#EFF6FF]'
              : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#2563EB]/60 hover:bg-[#EFF6FF]/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            data-testid="doc-sanitize-file-input"
            accept={`${defaultHandlerRegistry.getAcceptAttribute()},.pdf`}
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-2.5">
            {isProcessing ? (
              <>
                <Loader2 className="w-7 h-7 text-[#2563EB] animate-spin" />
                <p className="text-sm font-medium text-[#0F172A]">
                  Sanitizing file locally in your browser...
                </p>
              </>
            ) : (
              <>
                <div className="w-11 h-11 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center shadow-2xs">
                  <FileUp className="w-5 h-5 text-[#2563EB]" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#111827]">
                    Drag &amp; drop file here, or click to select from device
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Supported: <code className="font-mono">.xlsx</code>,{' '}
                    <code className="font-mono">.xls</code>,{' '}
                    <code className="font-mono">.csv</code>,{' '}
                    <code className="font-mono">.docx</code>,{' '}
                    <code className="font-mono">.txt</code>,{' '}
                    <code className="font-mono">.md</code>, and code/config files
                  </p>
                  <p className="text-[11px] text-[#9CA3AF]">
                    PDF is not supported yet &middot; Files never leave your device
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Friendly Error / PDF Rejection Notice */}
        {errorMessage && (
          <div
            role="alert"
            data-testid="doc-sanitize-error"
            className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 flex items-start gap-2.5 text-xs text-[#991B1B]"
          >
            <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Step 2: Immediate Sanitization Result */}
      {result && (
        <div
          data-testid="doc-sanitize-result"
          className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]/60 p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#065F46]">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span className="truncate">
                  {result.mapping.sourceFileName} sanitized &middot;{' '}
                  {result.totalReplacements} sensitive{' '}
                  {result.totalReplacements === 1 ? 'item' : 'items'} masked
                </span>
              </div>

              {categoryEntries.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-xs text-[#047857]">Breakdown:</span>
                  {categoryEntries.map(([cat, count]) => (
                    <span
                      key={cat}
                      className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-[#A7F3D0] text-[#065F46]"
                    >
                      {count} {CATEGORY_LABELS[cat] ?? cat}
                    </span>
                  ))}
                  {result.metadataStripped && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#A7F3D0] text-[#047857]">
                      Metadata stripped
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-[#047857] pt-0.5">
                {isVaultPersistent ? (
                  <>
                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Mapping auto-saved to Local Vault (IndexedDB) &middot;{' '}
                      {result.mapping.entryCount} unique{' '}
                      {result.mapping.entryCount === 1 ? 'entry' : 'entries'}
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                    <span className="text-[#92400E]">
                      IndexedDB is restricted in this browser mode &mdash; export the{' '}
                      <code className="font-mono">.json</code> key map below to keep it safe.
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {result.warnings && result.warnings.length > 0 && (
            <div className="rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2 text-xs text-[#92400E]">
              {result.warnings.join(' ')}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadSanitized}
                data-testid="download-sanitized-doc-btn"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1D4ED8] transition-colors cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Sanitized File</span>
              </button>

              <button
                type="button"
                onClick={handleExportKeyMap}
                data-testid="export-sanitized-keyfile-btn"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#D1D5DB] text-[#111827] text-xs font-medium hover:bg-[#F9FAFB] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#6B7280]" />
                <span>Export Key Map (.json)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onGoToRestore(result.mapping.id)}
              data-testid="go-to-restore-btn"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#065F46] hover:text-[#047857] cursor-pointer"
            >
              <span>Done with AI? Go to Restore</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
