import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  HelpCircle,
} from 'lucide-react';
import type { RestoreVerificationDiff } from '@/core/types';
import { maskSensitiveValue } from '../utils/format';

interface DiffReportProps {
  diff: RestoreVerificationDiff;
}

export function DiffReport({ diff }: DiffReportProps) {
  const [expanded, setExpanded] = useState(
    diff.unmatchedCount > 0 || diff.unknownCount > 0,
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const toggleReveal = (placeholder: string) => {
    setRevealed((prev) => {
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
      data-testid="verification-diff-container"
      className="rounded-lg border border-[#E5E7EB] bg-white overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        data-testid="toggle-diff-report-btn"
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-medium text-[#111827] hover:bg-[#FAFAFB] transition-colors cursor-pointer"
      >
        <span>
          View Verification Diff ({diff.replacedUniqueCount} replaced &middot;{' '}
          {diff.unmatchedCount} unmatched &middot; {diff.unknownCount} unknown)
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#6B7280] transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div
          data-testid="verification-diff-body"
          className="border-t border-[#E5E7EB] p-3.5 space-y-4 text-xs"
        >
          {/* Dimension 1: Replaced */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[#047857]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
              <span>
                Replaced ({diff.replacedCount} occurrences across{' '}
                {diff.replacedUniqueCount} keys)
              </span>
            </div>

            {diff.replaced.length === 0 ? (
              <p className="text-[#6B7280] pl-5">
                No placeholders from the active map were found in this file.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
                {diff.replaced.map((item) => {
                  const isVisible = revealed.has(item.placeholder);
                  return (
                    <div
                      key={item.placeholder}
                      className="px-3 py-1.5 flex items-center justify-between gap-2 bg-white"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#3730A3] shrink-0">
                          {item.placeholder}
                        </span>
                        <span className="font-mono text-[11px] text-[#374151] truncate">
                          {isVisible
                            ? item.originalValue
                            : maskSensitiveValue(item.originalValue)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] text-[#6B7280]">
                          &times;{item.replacedCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleReveal(item.placeholder)}
                          aria-label={isVisible ? 'Mask original value' : 'Reveal original value'}
                          className="p-1 text-[#6B7280] hover:text-[#111827] cursor-pointer"
                        >
                          {isVisible ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dimension 2: Unmatched from Map */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[#B45309]">
              <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
              <span>
                Unmatched / Missing from AI File ({diff.unmatchedCount})
              </span>
            </div>

            {diff.unmatchedFromMap.length === 0 ? (
              <p className="text-[#6B7280] pl-5">
                Every key from your mapping table was accounted for in the AI output.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-md px-2.5 py-1.5">
                  These placeholders existed in your original file but did not appear in the AI output. Verify whether the AI dropped or merged rows.
                </p>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-[#FDE68A] divide-y divide-[#FEF3C7]">
                  {diff.unmatchedFromMap.map((item) => {
                    const isVisible = revealed.has(`unmatched:${item.placeholder}`);
                    return (
                      <div
                        key={item.placeholder}
                        className="px-3 py-1.5 flex items-center justify-between gap-2 bg-[#FFFBEB]/40"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] shrink-0">
                            {item.placeholder}
                          </span>
                          <span className="font-mono text-[11px] text-[#78350F] truncate">
                            {isVisible
                              ? item.originalValue
                              : maskSensitiveValue(item.originalValue)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleReveal(`unmatched:${item.placeholder}`)}
                          aria-label={isVisible ? 'Mask value' : 'Reveal value'}
                          className="p-1 text-[#92400E] hover:text-[#78350F] cursor-pointer"
                        >
                          {isVisible ? (
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

          {/* Dimension 3: Unknown Placeholders in AI File */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[#B91C1C]">
              <HelpCircle className="w-3.5 h-3.5 text-[#DC2626]" />
              <span>
                Unknown Placeholders in File ({diff.unknownCount})
              </span>
            </div>

            {diff.unknownInFile.length === 0 ? (
              <p className="text-[#6B7280] pl-5">
                No unrecognized placeholders were found in the uploaded file.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-2.5 py-1.5">
                  These placeholders were found in the AI file but do not exist in the selected map. You may have selected a different mapping table, or the AI altered a placeholder number.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {diff.unknownInFile.map((item) => (
                    <span
                      key={item.placeholder}
                      className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]"
                    >
                      {item.placeholder} (&times;{item.occurrences})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
