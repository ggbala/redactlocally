import { RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';

const STEPS = [
  {
    step: 'Step 1',
    title: 'Sanitize 100% Locally',
    description:
      'Paste text or code, or drop Excel, Word, or config files. Sensitive PII and API secrets are replaced with consistent placeholders ([EMAIL_1], [AWS_KEY_1]) right inside your browser.',
    Icon: ShieldCheck,
    accentBorder: 'border-t-[#2563EB]',
    badgeClass: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
    iconWrapClass: 'bg-[#EFF6FF] text-[#2563EB]',
  },
  {
    step: 'Step 2',
    title: 'Use Any AI Safely',
    description:
      'Copy the sanitized prompt or upload the cleaned document to ChatGPT, Claude, or Gemini without exposing client names, financial records, or production credentials.',
    Icon: Sparkles,
    accentBorder: 'border-t-[#4F46E5]',
    badgeClass: 'bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]',
    iconWrapClass: 'bg-[#EEF2FF] text-[#4F46E5]',
  },
  {
    step: 'Step 3',
    title: 'One-Click Local Restore',
    description:
      'Paste the AI reply or upload the AI-edited document to instantly restore original values from your local-only mapping table — with a full verification diff.',
    Icon: RotateCcw,
    accentBorder: 'border-t-[#0F766E]',
    badgeClass: 'bg-[#F0FDFA] text-[#0F766E] border-[#99F6E4]',
    iconWrapClass: 'bg-[#F0FDFA] text-[#0F766E]',
  },
];

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works-heading"
      data-testid="seo-how-it-works"
      className="pt-14 space-y-5"
    >
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2563EB]">
          Workflow
        </p>
        <h2
          id="how-it-works-heading"
          className="text-xl font-bold tracking-tight text-[#0F172A]"
        >
          How It Works &mdash; Reversible Pseudonymization for AI
        </h2>
        <p className="text-sm text-[#475569]">
          Anonymize data before ChatGPT, Claude, or Gemini in three offline steps without uploading sensitive files to any third-party server.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map(
          ({
            step,
            title,
            description,
            Icon,
            accentBorder,
            badgeClass,
            iconWrapClass,
          }) => (
            <div
              key={step}
              className={`rounded-2xl border border-[#E2E8F0] border-t-2 ${accentBorder} bg-white p-5 space-y-3 shadow-2xs`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badgeClass}`}
                >
                  {step}
                </span>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconWrapClass}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-sm font-semibold text-[#0F172A]">{title}</h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                {description}
              </p>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
