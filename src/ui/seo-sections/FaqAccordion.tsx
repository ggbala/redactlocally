import { ChevronDown } from 'lucide-react';

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question:
      'How do I anonymize text before pasting into ChatGPT or Claude?',
    answer:
      'In Text Sanitizer mode, paste your original prompt, email, or notes on the left and click Sanitize. Sensitive values are replaced locally with consistent numbered placeholders like [EMAIL_1] or [PHONE_1]. Copy the cleaned text to ChatGPT or Claude, then click "Restore AI Reply" on the status bar to expand the restoration row and swap placeholders back to your real values using the active in-memory map.',
  },
  {
    question:
      'Is this free online PII redaction tool truly private? Does any data touch a server?',
    answer:
      'Yes. All detection, document parsing, and restoration run 100% client-side inside your browser with zero outbound network requests. You can verify this anytime by opening DevTools (F12) → Network while sanitizing. The full codebase is open source under the MIT License on GitHub, and you can also download the standalone single-file offline HTML build to run completely air-gapped.',
  },
  {
    question:
      'Can I sanitize code and scrub API keys, tokens, or secrets from logs before asking AI to debug?',
    answer:
      'Yes. Our built-in secrets scrubber detects OpenAI, Anthropic, AWS Access & Secret Keys, GitHub tokens, Stripe keys, Slack tokens, Google Cloud API keys, JWTs, PEM private key blocks, database connection URIs, Bearer tokens, .env passwords, and IPv4/IPv6/MAC addresses. You can paste snippets directly or upload .env, .json, .sql, .yaml, .log, .py, or .ts files while keeping JSON syntax valid.',
  },
  {
    question:
      'How do I anonymize Word (.docx) or Excel (.xlsx / .csv) documents for AI without breaking formulas or layout?',
    answer:
      'Switch to Document Sanitizer and drop your .xlsx, .csv, or .docx file. Excel spreadsheets keep all formulas (such as =SUM(...)), column widths, multiple sheets, and basic formatting intact. Word documents merge split XML text runs so partially bolded emails or phones are still caught while preserving tables, headers, footers, and styles — plus optional author/company metadata stripping. After AI processing, upload the output to restore values with a full verification diff.',
  },
  {
    question:
      'Why use an offline web tool instead of a Chrome extension to redact PII in ChatGPT?',
    answer:
      'Many Chrome extensions are closed-source and request broad read/write permissions across every browser tab — which corporate IT teams often block — and they rarely handle full Excel or Word documents. This tool requires zero browser permissions, zero installation, is 100% open source, works with any AI provider, supports roundtrip document restoration, and can run from a single offline HTML file.',
  },
  {
    question:
      'Where are my restoration mapping tables stored, and can I back them up or delete them?',
    answer:
      'Text Mode mappings exist strictly in ephemeral browser memory: every new Sanitize run overwrites the previous table, and closing or refreshing the tab destroys it completely. Document Mode mappings auto-save to your browser’s local IndexedDB vault bound to the original filename. You can export any map as a portable .json key file for offline backup or delete individual maps / clear the entire vault at any time.',
  },
  {
    question: 'Does this tool support PDF redaction?',
    answer:
      'RedactLocally currently focuses on lossless, reversible sanitization for text, code, Excel (.xlsx, .xls, .csv), and Word (.docx) files where structure and formulas can be cleanly preserved. True irreversible PDF redaction is on the roadmap for an upcoming release. For now, please convert PDFs to .docx, .xlsx, or .txt before sanitizing.',
  },
  {
    question:
      'Can I scan an entire local folder or code repository to find secrets and PII without modifying any files?',
    answer:
      'Yes. Switch to the Directory Scanner tab and select or drag & drop any local folder. RedactLocally recursively scans supported code, config, Excel (.xlsx/.csv), Word (.docx), and text files strictly in read-only mode — highlighting every finding by exact file path, line number, spreadsheet cell, or paragraph without modifying any file or uploading data. Dependency folders like node_modules, .git, and dist are skipped by default, and you can export a masked JSON audit report.',
  },
  {
    question:
      'How can I redact company-specific names or project codenames that standard regex cannot detect?',
    answer:
      'Open the Rules drawer in the top-right corner to add exact custom keywords (such as client names, internal company names, or deal codenames) or custom regular expressions with your own placeholder prefix. Our modular detector architecture also reserves a plugin seam for optional local in-browser NER small models in future releases.',
  },
];

export function FaqAccordion() {
  return (
    <section
      aria-labelledby="faq-heading"
      data-testid="seo-faq"
      className="pt-14 space-y-5"
    >
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2563EB]">
          FAQ
        </p>
        <h2
          id="faq-heading"
          className="text-xl font-bold tracking-tight text-[#0F172A]"
        >
          Frequently Asked Questions
        </h2>
        <p className="text-sm text-[#475569]">
          Common questions about local PII redaction, secrets scrubbing, and offline Excel &amp; Word anonymization.
        </p>
      </div>

      <div className="rounded-2xl border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0] shadow-2xs overflow-hidden">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.question}
            className="group border-l-2 border-l-transparent open:border-l-[#2563EB] transition-colors"
          >
            <summary className="list-none px-5 py-4 flex items-center justify-between gap-4 text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] hover:text-[#1D4ED8] transition-colors cursor-pointer select-none">
              <span>{item.question}</span>
              <ChevronDown className="w-4 h-4 text-[#64748B] group-open:text-[#2563EB] shrink-0 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-4 text-xs sm:text-sm text-[#475569] leading-relaxed">
              {item.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
