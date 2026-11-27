import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FolderOpen,
  FolderSearch,
  Loader2,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { SanitizationEngine } from '@/core/engine';
import type { CustomRule, RuleConfig } from '@/core/types';
import {
  DirectoryScanner,
  normalizeFileList,
  serializeAuditReportJson,
} from '@/scanner/directory-scanner';
import type {
  DirectoryFileInput,
  DirectoryScanProgress,
  DirectoryScanReport,
} from '@/scanner/types';
import { CATEGORY_LABELS, downloadBlob } from '../utils/format';
import { ScanFileCard } from './ScanFileCard';

interface WebkitFileSystemEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath: string;
}

interface WebkitFileSystemFileEntry extends WebkitFileSystemEntry {
  file(
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface WebkitFileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: WebkitFileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface WebkitFileSystemDirectoryEntry extends WebkitFileSystemEntry {
  createReader(): WebkitFileSystemDirectoryReader;
}

async function readAllDirectoryEntries(
  dirEntry: WebkitFileSystemDirectoryEntry,
): Promise<WebkitFileSystemEntry[]> {
  const reader = dirEntry.createReader();
  const collected: WebkitFileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<WebkitFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) {
      break;
    }
    collected.push(...batch);
  }

  return collected;
}

async function collectFilesFromEntry(
  entry: WebkitFileSystemEntry,
  prefix = '',
): Promise<DirectoryFileInput[]> {
  if (entry.isFile) {
    const fileEntry = entry as WebkitFileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return [{ file, relativePath }];
  }

  if (entry.isDirectory) {
    const dirEntry = entry as WebkitFileSystemDirectoryEntry;
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const children = await readAllDirectoryEntries(dirEntry);
    const results: DirectoryFileInput[] = [];
    for (const child of children) {
      results.push(...(await collectFilesFromEntry(child, nextPrefix)));
    }
    return results;
  }

  return [];
}

interface FolderScanWorkspaceProps {
  engine: SanitizationEngine;
  builtInRules: readonly RuleConfig[];
  enabledRuleIds: ReadonlySet<string>;
  customRules: readonly CustomRule[];
}

export function FolderScanWorkspace({
  engine,
  builtInRules,
  enabledRuleIds,
  customRules,
}: FolderScanWorkspaceProps) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scanner = useMemo(
    () => new DirectoryScanner(engine, builtInRules),
    [engine, builtInRules],
  );

  const [ignoreDefaultDirs, setIgnoreDefaultDirs] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<DirectoryScanProgress | null>(null);
  const [report, setReport] = useState<DirectoryScanReport | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Result filters
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);

  const runScan = async (inputs: DirectoryFileInput[]) => {
    if (inputs.length === 0) {
      setScanError('The selected folder contains no readable files.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setScanError(null);
    setReport(null);
    setActiveCategory('all');
    setSearchQuery('');
    setShowSkipped(false);
    setIsScanning(true);
    setProgress({ processed: 0, total: inputs.length, currentFile: inputs[0].relativePath });

    try {
      const scanReport = await scanner.scanFiles(inputs, {
        enabledRuleIds,
        customRules,
        ignoreDefaultDirs,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      setReport(scanReport);
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : 'Failed to scan the selected directory locally.',
      );
    } finally {
      setIsScanning(false);
      abortRef.current = null;
    }
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      const inputs = normalizeFileList(fileList);
      void runScan(inputs);
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const entries: WebkitFileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as DataTransferItem & {
          webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
        };
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          entries.push(entry);
        }
      }

      if (entries.length > 0) {
        const collected: DirectoryFileInput[] = [];
        for (const entry of entries) {
          collected.push(...(await collectFilesFromEntry(entry)));
        }
        collected.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        void runScan(collected);
        return;
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void runScan(normalizeFileList(e.dataTransfer.files));
    }
  };

  const handleCancelScan = () => {
    abortRef.current?.abort();
  };

  const handleExportAuditJson = () => {
    if (!report) return;
    const json = serializeAuditReportJson(report);
    const safeName = report.rootFolderName.replace(/[^A-Za-z0-9._-]+/g, '_');
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `${safeName}_sensitive_scan_report.json`);
  };

  const flaggedFiles = useMemo(() => {
    if (!report) return [];
    const q = searchQuery.trim().toLowerCase();

    return report.files
      .filter((f) => f.status === 'findings')
      .map((fileSummary) => {
        const matchedFindings = fileSummary.findings.filter((finding) => {
          if (activeCategory !== 'all' && finding.category !== activeCategory) {
            return false;
          }
          if (!q) return true;
          return (
            fileSummary.filePath.toLowerCase().includes(q) ||
            finding.ruleLabel.toLowerCase().includes(q) ||
            finding.ruleId.toLowerCase().includes(q) ||
            finding.location.toLowerCase().includes(q)
          );
        });

        return { fileSummary, matchedFindings };
      })
      .filter((item) => item.matchedFindings.length > 0);
  }, [report, activeCategory, searchQuery]);

  const skippedOrErrorFiles = useMemo(() => {
    if (!report) return [];
    return report.files.filter(
      (f) => f.status === 'skipped' || f.status === 'error',
    );
  }, [report]);

  const availableCategories = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.categoryCounts).filter(([, count]) => count > 0);
  }, [report]);

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <section
      aria-label="Local Directory Sensitive Data Scanner"
      data-testid="folder-workspace"
      className="w-full rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05),0_10px_28px_-12px_rgba(15,23,42,0.08)] overflow-hidden"
    >
      {/* Top Read-Only Mode Bar */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FolderSearch className="w-4 h-4 text-[#2563EB] shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-[#0F172A]">
            Read-Only Local Directory Audit
          </span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
            Scan &amp; Alert Only &middot; No Files Modified
          </span>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-[#475569] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ignoreDefaultDirs}
            onChange={(e) => setIgnoreDefaultDirs(e.target.checked)}
            data-testid="ignore-default-dirs-checkbox"
            className="rounded border-[#CBD5E1] accent-[#2563EB]"
          />
          <span>
            Skip build &amp; dependency folders (
            <code className="font-mono text-[11px]">node_modules</code>,{' '}
            <code className="font-mono text-[11px]">.git</code>,{' '}
            <code className="font-mono text-[11px]">dist</code>)
          </span>
        </label>
      </div>

      {/* Main Content */}
      <div className="p-4 sm:p-6 space-y-5">
        {/* Hidden Directory Picker Input */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          data-testid="folder-scan-input"
          onChange={handleFolderInputChange}
          className="hidden"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        />

        {/* Picker / Dropzone (full size before scan, compact when report is shown) */}
        {!report && !isScanning && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => void handleDrop(e)}
            onClick={() => folderInputRef.current?.click()}
            data-testid="folder-scan-dropzone"
            className={`rounded-xl border-2 border-dashed p-9 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-[#2563EB] bg-[#EFF6FF]'
                : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#2563EB]/60 hover:bg-[#EFF6FF]/40'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center shadow-2xs">
                <FolderOpen className="w-5.5 h-5.5 text-[#2563EB]" />
              </div>
              <div className="space-y-1 max-w-lg">
                <p className="text-sm font-semibold text-[#0F172A]">
                  Select a local folder to scan, or drag &amp; drop a folder here
                </p>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Recursively inspects code, configs, Excel (<code className="font-mono">.xlsx</code>/<code className="font-mono">.csv</code>), Word (<code className="font-mono">.docx</code>), and text files locally &mdash; highlights all detected secrets &amp; PII without modifying or uploading any file.
                </p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold shadow-[0_2px_8px_rgba(37,99,235,0.28)]">
                <FolderSearch className="w-3.5 h-3.5" />
                <span>Choose Local Directory</span>
              </span>
            </div>
          </div>
        )}

        {/* Active Scanning Progress */}
        {isScanning && progress && (
          <div
            data-testid="folder-scan-progress"
            className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF]/60 p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1E3A8A]">
                <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin shrink-0" />
                <span>
                  Scanning directory locally ({progress.processed} / {progress.total} files)...
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelScan}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#CBD5E1] bg-white text-xs font-medium text-[#475569] hover:text-[#DC2626] hover:border-[#FECACA] cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            <div className="w-full h-2 rounded-full bg-[#DBEAFE] overflow-hidden">
              <div
                className="h-full bg-[#2563EB] transition-all duration-150"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {progress.currentFile && (
              <p className="text-xs font-mono text-[#475569] truncate">
                Inspecting: {progress.currentFile}
              </p>
            )}
          </div>
        )}

        {/* Error Alert */}
        {scanError && (
          <div
            role="alert"
            data-testid="folder-scan-error"
            className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 flex items-start gap-2.5 text-xs text-[#991B1B]"
          >
            <ShieldAlert className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
            <span>{scanError}</span>
          </div>
        )}

        {/* Scan Report Results */}
        {report && !isScanning && (
          <div data-testid="folder-scan-report" className="space-y-5">
            {/* Top Report Header + Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                  <FolderOpen className="w-4 h-4 text-[#2563EB] shrink-0" />
                  <span className="truncate">{report.rootFolderName}</span>
                  {report.cancelled && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#FEF3C7] text-[#92400E]">
                      Partial (Cancelled)
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Scanned {report.scannedFilesCount} of {report.totalFilesDiscovered} files locally in {report.durationMs} ms &middot; Original files were not modified
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportAuditJson}
                  data-testid="export-scan-report-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#475569]" />
                  <span>Export Report (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  data-testid="rescan-folder-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1D4ED8] cursor-pointer shadow-2xs"
                >
                  <FolderSearch className="w-3.5 h-3.5" />
                  <span>Scan Another Folder</span>
                </button>
              </div>
            </div>

            {/* 4 KPI Summary Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div
                className={`rounded-xl border p-3.5 ${
                  report.totalFindings > 0
                    ? 'border-[#FECACA] bg-[#FEF2F2]/70'
                    : 'border-[#A7F3D0] bg-[#ECFDF5]/70'
                }`}
              >
                <div className="text-[11px] font-medium text-[#475569]">
                  Sensitive Findings
                </div>
                <div
                  data-testid="scan-total-findings"
                  className={`mt-1 text-xl font-bold font-mono ${
                    report.totalFindings > 0 ? 'text-[#B91C1C]' : 'text-[#047857]'
                  }`}
                >
                  {report.totalFindings}
                </div>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                <div className="text-[11px] font-medium text-[#475569]">
                  Files With Alerts
                </div>
                <div
                  data-testid="scan-flagged-files-count"
                  className="mt-1 text-xl font-bold font-mono text-[#0F172A]"
                >
                  {report.filesWithFindingsCount}
                  <span className="text-xs font-normal text-[#64748B]">
                    {' '}
                    / {report.scannedFilesCount}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                <div className="text-[11px] font-medium text-[#475569]">
                  Clean Files
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-[#047857]">
                  {report.cleanFilesCount}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSkipped((v) => !v)}
                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] p-3.5 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-[11px] font-medium text-[#475569]">
                  <span>Skipped</span>
                  {skippedOrErrorFiles.length > 0 && (
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${
                        showSkipped ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-[#475569]">
                  {report.skippedFilesCount + report.errorFilesCount}
                </div>
              </button>
            </div>

            {/* Zero Findings Clean Banner */}
            {report.totalFindings === 0 ? (
              <div
                data-testid="scan-clean-banner"
                className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]/70 px-4 py-4 flex items-center gap-3 text-sm font-medium text-[#065F46]"
              >
                <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
                <span>
                  No sensitive data detected across {report.scannedFilesCount}{' '}
                  scanned {report.scannedFilesCount === 1 ? 'file' : 'files'}.
                </span>
              </div>
            ) : (
              <>
                {/* Category Filter Pills & Search */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveCategory('all')}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        activeCategory === 'all'
                          ? 'bg-[#2563EB] text-white border-[#2563EB]'
                          : 'bg-white text-[#475569] border-[#CBD5E1] hover:border-[#94A3B8]'
                      }`}
                    >
                      All ({report.totalFindings})
                    </button>
                    {availableCategories.map(([cat, count]) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                          activeCategory === cat
                            ? 'bg-[#2563EB] text-white border-[#2563EB]'
                            : 'bg-white text-[#475569] border-[#CBD5E1] hover:border-[#94A3B8]'
                        }`}
                      >
                        {CATEGORY_LABELS[cat] ?? cat} ({count})
                      </button>
                    ))}
                  </div>

                  <div className="relative sm:w-64">
                    <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="scan-search-input"
                      placeholder="Filter by path or rule..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                {/* Grouped File Findings List */}
                <div className="space-y-3">
                  {flaggedFiles.length === 0 ? (
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-6 text-center text-xs text-[#64748B]">
                      No findings match your current filter.
                    </div>
                  ) : (
                    flaggedFiles.map(({ fileSummary, matchedFindings }, idx) => (
                      <ScanFileCard
                        key={fileSummary.filePath}
                        fileSummary={fileSummary}
                        filteredFindings={matchedFindings}
                        defaultExpanded={idx < 5}
                      />
                    ))
                  )}
                </div>
              </>
            )}

            {/* Collapsible Skipped / Error Files Drawer */}
            {showSkipped && skippedOrErrorFiles.length > 0 && (
              <div
                data-testid="scan-skipped-drawer"
                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#334155]">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>
                    Skipped &amp; Unreadable Files ({skippedOrErrorFiles.length})
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-white">
                  {skippedOrErrorFiles.map((item) => (
                    <div
                      key={item.filePath}
                      className="px-3 py-1.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-mono text-[#334155] truncate">
                        {item.filePath}
                      </span>
                      <span className="text-[11px] text-[#64748B] shrink-0">
                        {item.status === 'error'
                          ? item.errorMessage
                          : item.skipReason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
