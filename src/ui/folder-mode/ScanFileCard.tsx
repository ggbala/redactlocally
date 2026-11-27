import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Eye,
  EyeOff,
  FileCode2,
} from 'lucide-react';
import type { ScanFinding, ScannedFileSummary } from '@/scanner/types';
import { CATEGORY_LABELS } from '../utils/format';

interface ScanFileCardProps {
  fileSummary: ScannedFileSummary;
  filteredFindings: readonly ScanFinding[];
  defaultExpanded: boolean;
}

const CATEGORY_BADGE_STYLES: Readonly<Record<string, string>> = {
  secrets: 'bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]',
  pii: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  financial: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
  network: 'bg-[#F0FDFA] text-[#0F766E] border-[#99F6E4]',
  custom: 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]',
};

export function ScanFileCard({
  fileSummary,
  filteredFindings,
  defaultExpanded,
}: ScanFileCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const catCounts: Record<string, number> = {};
  for (const f of filteredFindings) {
    catCounts[f.category] = (catCounts[f.category] ?? 0) + 1;
  }

  return (
    <div
      data-testid="scan-file-card"
      className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-2xs"
    >
      {/* File Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 bg-[#F8FAFC] hover:bg-[#F1F5F9]/80 flex flex-wrap items-center justify-between gap-2 text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={`w-4 h-4 text-[#64748B] shrink-0 transition-transform duration-200 ${
              expanded ? 'rotate-180' : '-rotate-90'
            }`}
          />
          <FileCode2 className="w-4 h-4 text-[#D97706] shrink-0" />
          <span className="font-mono text-xs font-semibold text-[#0F172A] truncate">
            {fileSummary.filePath}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]">
            <AlertTriangle className="w-3 h-3" />
            {filteredFindings.length}{' '}
            {filteredFindings.length === 1 ? 'finding' : 'findings'}
          </span>
          {Object.entries(catCounts).map(([cat, count]) => (
            <span
              key={cat}
              className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                CATEGORY_BADGE_STYLES[cat] ??
                'bg-[#F1F5F9] text-[#334155] border-[#E2E8F0]'
              }`}
            >
              {count} {CATEGORY_LABELS[cat] ?? cat}
            </span>
          ))}
        </div>
      </button>

      {/* Findings Rows */}
      {expanded && (
        <div className="divide-y divide-[#F1F5F9] border-t border-[#E2E8F0]">
          {filteredFindings.map((finding) => {
            const isVisible = revealedIds.has(finding.id);
            const badgeStyle =
              CATEGORY_BADGE_STYLES[finding.category] ??
              'bg-[#F1F5F9] text-[#334155] border-[#E2E8F0]';

            return (
              <div
                key={finding.id}
                data-testid="scan-finding-row"
                className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-white hover:bg-[#F8FAFC]/70 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                  <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded bg-[#F1F5F9] text-[#334155] shrink-0">
                    {finding.location}
                  </span>

                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded border shrink-0 ${badgeStyle}`}
                  >
                    {finding.ruleLabel}
                  </span>

                  <code className="font-mono text-[11px] text-[#475569] truncate max-w-full">
                    {isVisible ? finding.rawSnippet : finding.maskedSnippet}
                  </code>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span
                    data-testid="finding-value"
                    className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] max-w-[200px] truncate"
                  >
                    {isVisible ? finding.rawValue : finding.maskedValue}
                  </span>

                  <button
                    type="button"
                    onClick={() => toggleReveal(finding.id)}
                    aria-label={isVisible ? 'Mask sensitive value' : 'Reveal sensitive value'}
                    title={isVisible ? 'Mask value' : 'Reveal value'}
                    data-testid="toggle-finding-reveal-btn"
                    className="p-1 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
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
  );
}
