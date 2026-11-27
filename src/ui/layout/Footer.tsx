import { ExternalLink, Github, Shield } from 'lucide-react';
import { APP_CONFIG } from '@config/app.config';

export function Footer() {
  return (
    <footer
      data-testid="open-source-footer"
      className="mt-16 border-t border-[#E2E8F0] bg-white"
    >
      <div className="max-w-[1080px] w-full mx-auto px-4 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
            <Shield className="w-4 h-4 text-[#10B981]" />
            <span>
              {APP_CONFIG.brandName} &middot; Open Source ({APP_CONFIG.license} License)
            </span>
          </div>
          <p className="text-xs text-[#475569] max-w-2xl leading-relaxed">
            100% Open Source under the {APP_CONFIG.license} License. Audit the code, report issues, or download the standalone offline HTML build on GitHub. All text and document processing runs locally inside your browser with zero telemetry or server uploads.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href={APP_CONFIG.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="footer-github-link"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-medium hover:bg-[#1E293B] transition-colors shadow-2xs"
          >
            <Github className="w-3.5 h-3.5" />
            <span>View Source on GitHub</span>
            <ExternalLink className="w-3 h-3 opacity-75" />
          </a>
        </div>
      </div>
    </footer>
  );
}
