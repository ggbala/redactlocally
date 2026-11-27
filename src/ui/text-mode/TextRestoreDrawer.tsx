import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Info,
  Trash2,
} from 'lucide-react';
import type { RestoreVerificationDiff } from '@/core/types';
import type { TextMappingSnapshot } from '@/storage/types';

interface TextRestoreDrawerProps {
  isOpen: boolean;
  snapshot: TextMappingSnapshot | null;
  aiReplyInput: string;
  onAiReplyChange: (val: string) => void;
  restoredOutput: string;
  restoreDiff: RestoreVerificationDiff | null;
  isStaleResult: boolean;
  highlightPulse: boolean;
  onRestore: () => void;
  onCollapse: () => void;
}

export function TextRestoreDrawer({
  isOpen,
  snapshot,
  aiReplyInput,
  onAiReplyChange,
  restoredOutput,
  restoreDiff,
  isStaleResult,
  highlightPulse,
  onRestore,
  onCollapse,
}: TextRestoreDrawerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!restoredOutput) return;
    try {
      await navigator.clipboard.writeText(restoredOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onAiReplyChange(text);
      }
    } catch {
      // Clipboard read requires permission; user can paste directly with Cmd/Ctrl+V
    }
  };

  return (
    <div
      data-testid="text-restore-drawer"
      aria-hidden={!isOpen}
      className={`grid transition-[grid-template-rows,opacity] duration-250 ease-out ${
        isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="overflow-hidden">
        <div className="border-t border-[#E5E7EB] bg-white">
          {/* Context Binding Header */}
          <div
            className={`px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[#CCFBF1] transition-colors duration-300 ${
              highlightPulse ? 'bg-[#D1FAE5]' : 'bg-[#F0FDFA]'
            }`}
          >
            <div className="flex items-center gap-2 text-[#115E59]">
              <Info className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
              {snapshot ? (
                <span data-testid="restore-context-banner">
                  Restoring based on mapping generated at{' '}
                  <span className="font-mono font-semibold text-[#111827]">
                    [{snapshot.displayTime}]
                  </span>{' '}
                  ({snapshot.entryCount}{' '}
                  {snapshot.entryCount === 1 ? 'item' : 'items'})
                </span>
              ) : (
                <span>No active mapping available.</span>
              )}
            </div>

            <button
              type="button"
              onClick={onCollapse}
              data-testid="collapse-text-restore-btn"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[#6B7280] hover:text-[#111827] hover:bg-[#E5E7EB]/60 transition-colors cursor-pointer"
            >
              <span>Collapse</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Stale Mapping Refresh Notice */}
          {isStaleResult && snapshot && (
            <div
              data-testid="stale-mapping-notice"
              className="px-4 sm:px-5 py-2 bg-[#FFFBEB] border-b border-[#FDE68A] text-xs text-[#92400E] flex items-center gap-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
              <span>
                Mapping table updated at{' '}
                <span className="font-mono font-medium">
                  {snapshot.displayTime}
                </span>{' '}
                &mdash; click Restore again to refresh.
              </span>
            </div>
          )}

          {/* Row 2 Dual Textareas + Center Restore Button */}
          <div className="p-4 sm:p-5 flex flex-col md:flex-row items-stretch gap-4">
            {/* Left: Paste AI Reply */}
            <div className="flex-1 flex flex-col rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] focus-within:border-[#18181B] focus-within:bg-white transition-colors">
              <div className="px-3.5 py-2 border-b border-[#E5E7EB] flex items-center justify-between">
                <label
                  htmlFor="ai-reply-input"
                  className="text-xs font-semibold text-[#111827]"
                >
                  AI Reply (with placeholders)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePaste}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] cursor-pointer"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>Paste</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAiReplyChange('')}
                    disabled={!aiReplyInput}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <textarea
                id="ai-reply-input"
                data-testid="text-restore-input"
                value={aiReplyInput}
                onChange={(e) => onAiReplyChange(e.target.value)}
                rows={7}
                placeholder="Paste the AI reply containing placeholders like [EMAIL_1] or [AWS_KEY_1]..."
                className="w-full flex-1 p-3.5 bg-transparent text-sm font-mono text-[#111827] placeholder:text-[#9CA3AF] resize-y focus:outline-none leading-relaxed"
              />

              <div className="px-3.5 py-2 border-t border-[#E5E7EB] text-[11px] text-[#6B7280] flex items-center justify-between">
                <span>
                  {aiReplyInput.length > 0
                    ? `${aiReplyInput.length.toLocaleString()} chars`
                    : 'Waiting for AI reply'}
                </span>
              </div>
            </div>

            {/* Center Action Button */}
            <div className="flex md:flex-col items-center justify-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onRestore}
                disabled={!aiReplyInput.trim() || !snapshot}
                data-testid="text-restore-btn"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#115E59] disabled:bg-[#D1D5DB] disabled:text-[#6B7280] disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer min-w-[116px]"
              >
                <span>Restore</span>
                <ArrowRight className="w-3.5 h-3.5 hidden md:inline" />
                <ArrowDown className="w-3.5 h-3.5 md:hidden" />
              </button>
            </div>

            {/* Right: Restored Real Text */}
            <div className="flex-1 flex flex-col rounded-xl border border-[#E5E7EB] bg-[#FAFAFB]">
              <div className="px-3.5 py-2 border-b border-[#E5E7EB] flex items-center justify-between">
                <span className="text-xs font-semibold text-[#111827]">
                  Restored Original Text
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!restoredOutput}
                  data-testid="copy-restored-text-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-[#10B981]" />
                      <span className="text-[#047857]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <textarea
                readOnly
                data-testid="text-restore-output"
                value={restoredOutput}
                rows={7}
                placeholder="Restored text with your real values will appear here..."
                className="w-full flex-1 p-3.5 bg-transparent text-sm font-mono text-[#111827] placeholder:text-[#9CA3AF] resize-y focus:outline-none leading-relaxed"
              />

              <div className="px-3.5 py-2 border-t border-[#E5E7EB] text-[11px] flex flex-wrap items-center justify-between gap-2 min-h-[33px]">
                {restoreDiff ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center gap-1 text-[#047857] font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                      Replaced {restoreDiff.replacedCount}{' '}
                      {restoreDiff.replacedCount === 1
                        ? 'placeholder'
                        : 'placeholders'}
                    </span>
                    {restoreDiff.unknownCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[#B45309] font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
                        {restoreDiff.unknownCount} unrecognized{' '}
                        {restoreDiff.unknownCount === 1
                          ? 'placeholder'
                          : 'placeholders'}{' '}
                        left unchanged
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[#6B7280]">Ready to restore locally</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
