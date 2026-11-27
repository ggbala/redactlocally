import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, RotateCcw } from 'lucide-react';
import type { TextMappingSnapshot } from '@/storage/types';
import { maskSensitiveValue } from '../utils/format';

interface BridgeStatusBarProps {
  snapshot: TextMappingSnapshot | null;
  lastRunScannedZero: boolean;
  isRestoreOpen: boolean;
  onToggleRestore: () => void;
}

export function BridgeStatusBar({
  snapshot,
  lastRunScannedZero,
  isRestoreOpen,
  onToggleRestore,
}: BridgeStatusBarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const hasMapping = snapshot !== null && snapshot.entryCount > 0;

  const toggleReveal = (placeholder: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(placeholder)) {
        next.delete(placeholder);
      } else {
        next.add(placeholder);
      }
      return next;
    });
  };

  return (
    <div
      data-testid="text-bridge-bar"
      className={`relative px-4 sm:px-5 py-3 border-t flex flex-wrap items-center justify-between gap-3 transition-colors ${
        hasMapping
          ? 'bg-[#F0FDF4]/80 border-[#BBF7D0]'
          : 'bg-[#F8FAFC] border-[#E2E8F0]'
      }`}
    >
      {/* Left Status Indicator (3 states: empty, 0 items, ready) */}
      <div className="flex items-center gap-2 text-xs min-w-0">
        {hasMapping ? (
          <>
            <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
            <span className="text-[#111827] font-medium">
              Latest mapping ready (
              <button
                type="button"
                onClick={() => setPopoverOpen((v) => !v)}
                data-testid="mapping-preview-trigger"
                className="underline decoration-dotted underline-offset-2 text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
              >
                {snapshot.entryCount}{' '}
                {snapshot.entryCount === 1 ? 'item' : 'items'}
              </button>
              )
            </span>
            <span className="text-[#6B7280] hidden sm:inline">
              &middot; Local memory only &middot;{' '}
              <span className="font-mono">{snapshot.displayTime}</span>
            </span>
          </>
        ) : lastRunScannedZero ? (
          <>
            <span className="w-2 h-2 rounded-full bg-[#D97706] shrink-0" />
            <span className="text-[#92400E] font-medium">
              Scan complete (0 sensitive items detected) &middot; Text looks clean
            </span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-[#D1D5DB] shrink-0" />
            <span className="text-[#6B7280]">
              No active mapping yet &middot; Click Sanitize above to create a local memory map
            </span>
          </>
        )}
      </div>

      {/* Right Restore Drawer Toggle */}
      <button
        type="button"
        disabled={!hasMapping}
        onClick={onToggleRestore}
        data-testid="toggle-text-restore-btn"
        title={
          hasMapping
            ? 'Expand or collapse the local AI reply restoration panel'
            : 'Sanitize text first to generate a mapping table'
        }
        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
          hasMapping
            ? isRestoreOpen
              ? 'bg-[#0F766E] text-white border-[#0F766E] cursor-pointer shadow-xs'
              : 'bg-white text-[#0F766E] border-[#5EEAD4] hover:bg-[#F0FDFA] hover:border-[#14B8A6] cursor-pointer shadow-2xs'
            : 'bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0] cursor-not-allowed'
        }`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Restore AI Reply</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            isRestoreOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Lightweight Mapping Preview Popover (masked by default) */}
      {popoverOpen && hasMapping && (
        <div
          data-testid="mapping-preview-popover"
          className="absolute left-4 top-full mt-1.5 z-30 w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white shadow-lg p-3"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E5E7EB]">
            <span className="text-xs font-semibold text-[#111827]">
              Active Memory Mapping ({snapshot.entryCount})
            </span>
            <button
              type="button"
              onClick={() => setPopoverOpen(false)}
              className="text-xs text-[#6B7280] hover:text-[#111827] cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1.5">
            {snapshot.entries.map((entry) => {
              const revealed = revealedKeys.has(entry.placeholder);
              return (
                <div
                  key={entry.placeholder}
                  className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded-md bg-[#FAFAFB]"
                >
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#3730A3] shrink-0">
                    {entry.placeholder}
                  </span>
                  <span className="font-mono text-[11px] text-[#374151] truncate flex-1 text-right">
                    {revealed
                      ? entry.originalValue
                      : maskSensitiveValue(entry.originalValue)}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleReveal(entry.placeholder)}
                    aria-label={revealed ? 'Mask value' : 'Reveal value'}
                    className="p-1 text-[#6B7280] hover:text-[#111827] shrink-0 cursor-pointer"
                  >
                    {revealed ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
