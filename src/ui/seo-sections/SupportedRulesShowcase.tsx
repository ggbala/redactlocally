import type { RuleConfig } from '@/core/types';
import { defaultHandlerRegistry } from '@/handlers/registry';

interface SupportedRulesShowcaseProps {
  builtInRules: readonly RuleConfig[];
}

export function SupportedRulesShowcase({
  builtInRules,
}: SupportedRulesShowcaseProps) {
  const piiRules = builtInRules.filter((r) => r.category === 'pii');
  const financialRules = builtInRules.filter((r) => r.category === 'financial');
  const codeSecretRules = builtInRules.filter(
    (r) => r.category === 'secrets' || r.category === 'network',
  );
  const supportedHandlers = defaultHandlerRegistry.getSupportedHandlers();

  return (
    <section
      aria-labelledby="supported-rules-heading"
      data-testid="seo-supported-rules"
      className="pt-14 space-y-5"
    >
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2563EB]">
          Detection Engine
        </p>
        <h2
          id="supported-rules-heading"
          className="text-xl font-bold tracking-tight text-[#0F172A]"
        >
          Supported Rules, Secrets Scrubber &amp; Document Formats
        </h2>
        <p className="text-sm text-[#475569]">
          Automatically rendered from our open-source rule configuration &mdash; built to redact PII, remove API keys from text online, sanitize code before ChatGPT, and anonymize office documents.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Group 1: PII & Personal Data */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-3 shadow-2xs">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
            <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
            <span>PII &amp; Personal Data</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {piiRules.map((rule) => (
              <span
                key={rule.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155]"
              >
                <span>{rule.label}</span>
                <code className="font-mono text-[10px] text-[#1D4ED8] bg-[#EFF6FF] px-1 rounded">
                  [{rule.placeholderPrefix}_1]
                </code>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155]">
              <span>Custom Names, Clients &amp; Companies</span>
              <code className="font-mono text-[10px] text-[#1D4ED8] bg-[#EFF6FF] px-1 rounded">
                [CUSTOM_1]
              </code>
            </span>
          </div>
        </div>

        {/* Group 2: Financial & Business */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-3 shadow-2xs">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span>Financial &amp; Business</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {financialRules.map((rule) => (
              <span
                key={rule.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155]"
              >
                <span>{rule.label}</span>
                {rule.validator && (
                  <span className="text-[10px] font-medium text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0]/70 px-1.5 rounded">
                    {rule.validator === 'luhn'
                      ? 'Luhn-verified'
                      : rule.validator === 'iban'
                        ? 'Mod-97 verified'
                        : 'Validated'}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Group 3: Code & Secrets Scrubber */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-3 shadow-2xs">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
            <span className="w-2 h-2 rounded-full bg-[#4F46E5]" />
            <span>Code &amp; Secrets Scrubber</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {codeSecretRules.map((rule) => (
              <span
                key={rule.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155]"
              >
                <span>{rule.label}</span>
                <code className="font-mono text-[10px] text-[#3730A3] bg-[#EEF2FF] px-1 rounded">
                  [{rule.placeholderPrefix}_1]
                </code>
              </span>
            ))}
          </div>
        </div>

        {/* Group 4: Document Formats */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-3 shadow-2xs">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
            <span className="w-2 h-2 rounded-full bg-[#0F766E]" />
            <span>Supported Document Formats</span>
          </h3>
          <div className="space-y-2.5">
            {supportedHandlers.map((handler) => (
              <div key={handler.id} className="space-y-1">
                <div className="text-xs font-medium text-[#334155]">
                  {handler.displayName}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {handler.supportedExtensions.map((ext) => (
                    <code
                      key={ext}
                      className="font-mono text-[11px] font-medium px-2 py-0.5 rounded bg-[#F0FDFA] border border-[#CCFBF1] text-[#0F766E]"
                    >
                      {ext}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
