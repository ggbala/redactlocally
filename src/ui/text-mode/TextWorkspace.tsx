import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  Copy,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { SanitizationEngine } from '@/core/engine';
import type { CustomRule, RestoreVerificationDiff } from '@/core/types';
import {
  InMemoryTextMappingStore,
  createTextMappingSnapshot,
} from '@/storage/memory-store';
import type { TextMappingSnapshot } from '@/storage/types';
import { CATEGORY_LABELS } from '../utils/format';
import { BridgeStatusBar } from './BridgeStatusBar';
import { TextRestoreDrawer } from './TextRestoreDrawer';

const SAMPLE_PROMPT = `Hi team, please help draft a follow-up email for our Q3 incident review:

- Primary contact: alice.smith@acme-corp.com (Phone: +1-415-555-0199)
- Finance wire IBAN: DE89 3704 0044 0532 0130 00
- Staging server IP: 10.24.18.9
- Temporary AWS Access Key: AKIAIOSFODNN7EXAMPLE
- OpenAI project token: sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789

Summarize the action items clearly without exposing any customer data.`;

interface TextWorkspaceProps {
  engine: SanitizationEngine;
  enabledRuleIds: ReadonlySet<string>;
  customRules: readonly CustomRule[];
}

export function TextWorkspace({
  engine,
  enabledRuleIds,
  customRules,
}: TextWorkspaceProps) {
  const storeRef = useRef<InMemoryTextMappingStore>(
    new InMemoryTextMappingStore(),
  );

  const [originalInput, setOriginalInput] = useState('');
  const [sanitizedOutput, setSanitizedOutput] = useState('');
  const [snapshot, setSnapshot] = useState<TextMappingSnapshot | null>(null);
  const [lastRunScannedZero, setLastRunScannedZero] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Row 2 (Restore AI Reply) state — strictly collapsed by default
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [aiReplyInput, setAiReplyInput] = useState('');
  const [restoredOutput, setRestoredOutput] = useState('');
  const [restoreDiff, setRestoreDiff] =
    useState<RestoreVerificationDiff | null>(null);
  const [isStaleResult, setIsStaleResult] = useState(false);
  const [highlightPulse, setHighlightPulse] = useState(false);

  const handleSanitize = useCallback(() => {
    if (!originalInput.trim()) {
      return;
    }

    const result = engine.sanitizeTextSync(originalInput, {
      enabledRuleIds,
      customRules,
    });

    setSanitizedOutput(result.sanitizedText);

    if (result.entries.length > 0) {
      const nextSnapshot = createTextMappingSnapshot({
        entries: result.entries,
        totalReplacements: result.totalReplacements,
        categoryCounts: result.categoryCounts,
      });
      // Core Text Mode rule: overwrite in-memory mapping table on every sanitize
      storeRef.current.overwrite(nextSnapshot);
      setSnapshot(storeRef.current.getCurrent());
      setLastRunScannedZero(false);

      // Edge-case sync: if Row 2 is currently open, flash context bar & mark stale result
      if (isRestoreOpen) {
        setHighlightPulse(true);
        setTimeout(() => setHighlightPulse(false), 900);
        if (restoredOutput) {
          setIsStaleResult(true);
        }
      }
    } else {
      storeRef.current.clear();
      setSnapshot(null);
      setLastRunScannedZero(true);
      setIsRestoreOpen(false);
    }
  }, [
    originalInput,
    engine,
    enabledRuleIds,
    customRules,
    isRestoreOpen,
    restoredOutput,
  ]);

  // Cmd/Ctrl + Enter shortcut for instant sanitize
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const active = document.activeElement;
        if (active && active.id === 'original-text-input') {
          e.preventDefault();
          handleSanitize();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSanitize]);

  const handleCopySanitized = async () => {
    if (!sanitizedOutput) return;
    try {
      await navigator.clipboard.writeText(sanitizedOutput);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    } catch {
      // Ignore if clipboard blocked
    }
  };

  const handleRestore = () => {
    const activeMap = storeRef.current.getCurrent();
    if (!activeMap || !aiReplyInput.trim()) {
      return;
    }

    const result = engine.restoreText(aiReplyInput, activeMap.entries);
    setRestoredOutput(result.restoredText);
    setRestoreDiff(result.diff);
    setIsStaleResult(false);
  };

  const handleClearInput = () => {
    setOriginalInput('');
    setSanitizedOutput('');
    setLastRunScannedZero(false);
  };

  const categoryEntries = snapshot
    ? Object.entries(snapshot.categoryCounts).filter(([, count]) => count > 0)
    : [];

  return (
    <section
      aria-label="Text Sanitizer Workspace"
      data-testid="text-workspace"
      className="w-full rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05),0_10px_28px_-12px_rgba(15,23,42,0.08)] overflow-visible"
    >
      {/* Row 1: Primary Sanitize Workspace (Always Visible) */}
      <div className="p-4 sm:p-5 flex flex-col md:flex-row items-stretch gap-4">
        {/* Left: Original Text Input */}
        <div className="flex-1 flex flex-col rounded-xl border border-[#CBD5E1]/90 bg-[#F8FAFC] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/12 focus-within:bg-white transition-all">
          <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] bg-[#F1F5F9]/75 rounded-t-xl flex items-center justify-between">
            <label
              htmlFor="original-text-input"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F172A]"
            >
              <span className="w-2 h-2 rounded-full bg-[#64748B]" />
              <span>Original Text</span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOriginalInput(SAMPLE_PROMPT)}
                data-testid="load-sample-text-btn"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE]/80 hover:bg-[#DBEAFE] transition-colors cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Sample</span>
              </button>
              <button
                type="button"
                onClick={handleClearInput}
                disabled={!originalInput && !sanitizedOutput}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <textarea
            id="original-text-input"
            data-testid="text-original-input"
            value={originalInput}
            onChange={(e) => setOriginalInput(e.target.value)}
            rows={10}
            placeholder="Paste your prompt, email, logs, or code snippet here..."
            className="w-full flex-1 p-3.5 bg-transparent text-sm font-mono text-[#0F172A] placeholder:text-[#94A3B8] resize-y focus:outline-none leading-relaxed"
          />

          <div className="px-3.5 py-2 border-t border-[#E2E8F0] text-[11px] text-[#64748B] flex items-center justify-between">
            <span>{originalInput.length.toLocaleString()} chars</span>
            <span className="hidden sm:inline text-[#94A3B8]">
              Processed strictly in browser memory
            </span>
          </div>
        </div>

        {/* Center Action Button — Primary Focal Point */}
        <div className="flex md:flex-col items-center justify-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleSanitize}
            disabled={!originalInput.trim()}
            data-testid="text-sanitize-btn"
            className="inline-flex items-center justify-center gap-1.5 px-4.5 py-2.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1D4ED8] active:bg-[#1E40AF] disabled:bg-[#CBD5E1] disabled:text-[#64748B] disabled:shadow-none disabled:cursor-not-allowed transition-all shadow-[0_2px_10px_rgba(37,99,235,0.3)] cursor-pointer min-w-[118px]"
          >
            <span>Sanitize</span>
            <ArrowRight className="w-3.5 h-3.5 hidden md:inline" />
            <ArrowDown className="w-3.5 h-3.5 md:hidden" />
          </button>
          <span className="text-[10px] font-mono text-[#94A3B8] hidden md:inline">
            &#8984;&#8629;
          </span>
        </div>

        {/* Right: Sanitized Output */}
        <div
          className={`flex-1 flex flex-col rounded-xl border transition-colors ${
            sanitizedOutput
              ? 'border-[#86EFAC] bg-white'
              : 'border-[#CBD5E1]/90 bg-[#F8FAFC]'
          }`}
        >
          <div
            className={`px-3.5 py-2.5 border-b rounded-t-xl flex items-center justify-between transition-colors ${
              sanitizedOutput
                ? 'border-[#BBF7D0] bg-[#ECFDF5]/80'
                : 'border-[#E2E8F0] bg-[#F1F5F9]/75'
            }`}
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
              <span
                className={`w-2 h-2 rounded-full ${
                  sanitizedOutput ? 'bg-[#10B981]' : 'bg-[#CBD5E1]'
                }`}
              />
              <span>Sanitized Output</span>
              {sanitizedOutput && (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-white text-[#047857] border border-[#A7F3D0]">
                  AI-Safe
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={handleCopySanitized}
              disabled={!sanitizedOutput}
              data-testid="copy-sanitized-text-btn"
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium border border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#94A3B8] disabled:opacity-40 transition-colors cursor-pointer"
            >
              {copiedOutput ? (
                <>
                  <Check className="w-3 h-3 text-[#10B981]" />
                  <span className="text-[#047857]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-[#475569]" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <textarea
            readOnly
            data-testid="text-sanitized-output"
            value={sanitizedOutput}
            rows={10}
            placeholder="Sanitized text with safe placeholders like [EMAIL_1] will appear here..."
            className="w-full flex-1 p-3.5 bg-transparent text-sm font-mono text-[#0F172A] placeholder:text-[#94A3B8] resize-y focus:outline-none leading-relaxed"
          />

          <div className="px-3.5 py-2 border-t border-[#E2E8F0] text-[11px] flex flex-wrap items-center justify-between gap-2 min-h-[33px]">
            {snapshot ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-[#047857]">
                  {snapshot.totalReplacements} replaced
                </span>
                {categoryEntries.map(([cat, count]) => (
                  <span
                    key={cat}
                    className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]/70"
                  >
                    {count} {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[#64748B]">Safe to paste into ChatGPT or Claude</span>
            )}
          </div>
        </div>
      </div>

      {/* Middle Bridge Status Bar */}
      <BridgeStatusBar
        snapshot={snapshot}
        lastRunScannedZero={lastRunScannedZero}
        isRestoreOpen={isRestoreOpen}
        onToggleRestore={() => setIsRestoreOpen((prev) => !prev)}
      />

      {/* Row 2: Collapsible Restore AI Reply Drawer (Hidden by Default) */}
      <TextRestoreDrawer
        isOpen={isRestoreOpen}
        snapshot={snapshot}
        aiReplyInput={aiReplyInput}
        onAiReplyChange={setAiReplyInput}
        restoredOutput={restoredOutput}
        restoreDiff={restoreDiff}
        isStaleResult={isStaleResult}
        highlightPulse={highlightPulse}
        onRestore={handleRestore}
        onCollapse={() => setIsRestoreOpen(false)}
      />
    </section>
  );
}
