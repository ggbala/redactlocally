import { Download, Github, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { APP_CONFIG } from '@config/app.config';

interface HeaderProps {
  activeRulesCount: number;
  customRulesCount: number;
  onOpenRules: () => void;
}

export function Header({
  activeRulesCount,
  customRulesCount,
  onOpenRules,
}: HeaderProps) {
  const isOfflineBundle =
    typeof __IS_OFFLINE_BUILD__ !== 'undefined' && __IS_OFFLINE_BUILD__;
  const totalActive = activeRulesCount + customRulesCount;

  return (
    <header className="max-w-[1080px] w-full mx-auto px-4 pt-7 pb-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(37,99,235,0.28)]">
              <ShieldCheck className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-[#0F172A]">
              {APP_CONFIG.brandName}
            </span>
          </div>
          <h1 className="mt-3 text-xl sm:text-[26px] leading-tight font-bold tracking-tight text-[#0F172A]">
            Anonymize Text, Code &amp; Documents Before Asking AI{' '}
            <span className="text-[#2563EB]">&mdash; 100% Locally</span>
          </h1>
          <p className="mt-1.5 text-sm text-[#475569]">
            Redact PII, API keys, and sensitive Excel or Word data offline with reversible placeholders, then restore AI replies in one click.
          </p>
        </div>

        <nav
          aria-label="Workspace tools"
          className="flex items-center gap-2 shrink-0 self-start sm:self-center"
        >
          <button
            type="button"
            onClick={onOpenRules}
            data-testid="open-rules-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF]/80 text-xs font-medium text-[#1E3A8A] hover:bg-[#DBEAFE] hover:border-[#93C5FD] transition-colors shadow-2xs cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Rules</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-white text-[#1D4ED8] border border-[#BFDBFE]/80 font-semibold">
              {totalActive} active
            </span>
          </button>

          {!isOfflineBundle && (
            <a
              href={APP_CONFIG.offlineReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Download standalone single-file HTML version for air-gapped offline use"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-[#475569]" />
              <span className="hidden md:inline">Offline HTML</span>
            </a>
          )}

          <a
            href={APP_CONFIG.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View open-source code on GitHub"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition-colors shadow-2xs"
          >
            <Github className="w-3.5 h-3.5 text-[#0F172A]" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
