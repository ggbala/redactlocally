import { useState } from 'react';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { BuiltInRuleCategory, CustomRule, RuleConfig } from '@/core/types';

interface RulesDrawerProps {
  open: boolean;
  onClose: () => void;
  builtInRules: readonly RuleConfig[];
  enabledRuleIds: ReadonlySet<string>;
  onToggleRule: (ruleId: string) => void;
  onResetBuiltInRules: () => void;
  customRules: readonly CustomRule[];
  onAddCustomRule: (rule: CustomRule) => void;
  onToggleCustomRule: (id: string) => void;
  onRemoveCustomRule: (id: string) => void;
}

const CATEGORY_ORDER: Array<{ key: BuiltInRuleCategory; title: string }> = [
  { key: 'pii', title: 'PII & Personal Data' },
  { key: 'financial', title: 'Financial & Business' },
  { key: 'secrets', title: 'Developer Secrets & Tokens' },
  { key: 'network', title: 'Network & Infrastructure' },
];

export function RulesDrawer({
  open,
  onClose,
  builtInRules,
  enabledRuleIds,
  onToggleRule,
  onResetBuiltInRules,
  customRules,
  onAddCustomRule,
  onToggleCustomRule,
  onRemoveCustomRule,
}: RulesDrawerProps) {
  const [pattern, setPattern] = useState('');
  const [label, setLabel] = useState('');
  const [prefix, setPrefix] = useState('CUSTOM');
  const [mode, setMode] = useState<'exact' | 'regex'>('exact');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pattern.trim();
    if (!trimmed) {
      setFormError('Enter a keyword or regular expression pattern.');
      return;
    }

    if (mode === 'regex') {
      try {
        new RegExp(trimmed, caseSensitive ? 'g' : 'gi');
      } catch (err) {
        setFormError(
          `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }

    const cleanPrefix =
      prefix
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'CUSTOM';

    onAddCustomRule({
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: label.trim() || trimmed,
      mode,
      pattern: trimmed,
      placeholderPrefix: /^[A-Z]/.test(cleanPrefix) ? cleanPrefix : 'CUSTOM',
      caseSensitive,
      enabled: true,
    });

    setPattern('');
    setLabel('');
    setFormError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Sanitization Rules Configuration"
      data-testid="rules-drawer"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#111827]/25 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative z-10 w-full max-w-md bg-white h-full shadow-xl border-l border-[#E5E7EB] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">
              Detection Rules &amp; Custom Terms
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Toggle built-in patterns or add company names &amp; custom regexes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rules drawer"
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Custom Rules Creator */}
          <section className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#111827]">
                Add Custom Term or Regex
              </h3>
              <div className="inline-flex rounded-md border border-[#E5E7EB] bg-white p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setMode('exact')}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                    mode === 'exact'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  Exact Term
                </button>
                <button
                  type="button"
                  onClick={() => setMode('regex')}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                    mode === 'regex'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  Regex
                </button>
              </div>
            </div>

            <form onSubmit={handleAdd} className="space-y-2.5">
              <div>
                <input
                  type="text"
                  value={pattern}
                  onChange={(e) => {
                    setPattern(e.target.value);
                    setFormError(null);
                  }}
                  placeholder={
                    mode === 'exact'
                      ? 'e.g. Acme Holdings or Project Apollo'
                      : 'e.g. PROJ-[0-9]{4}'
                  }
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#18181B]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#18181B]"
                />
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="Prefix (e.g. COMPANY)"
                  className="px-3 py-1.5 text-xs font-mono rounded-lg border border-[#E5E7EB] bg-white focus:outline-none focus:border-[#18181B]"
                />
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                    className="rounded border-[#D1D5DB]"
                  />
                  <span>Case-sensitive</span>
                </label>

                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Rule</span>
                </button>
              </div>

              {formError && (
                <p className="text-xs text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-2.5 py-1.5">
                  {formError}
                </p>
              )}
            </form>

            {customRules.length > 0 && (
              <div className="pt-2 border-t border-[#E5E7EB] space-y-1.5">
                {customRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E5E7EB] text-xs"
                  >
                    <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => onToggleCustomRule(rule.id)}
                      />
                      <span className="truncate font-medium text-[#111827]">
                        {rule.label}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#3730A3] shrink-0">
                        [{rule.placeholderPrefix || 'CUSTOM'}_1]
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => onRemoveCustomRule(rule.id)}
                      aria-label={`Remove ${rule.label}`}
                      className="p-1 text-[#6B7280] hover:text-[#DC2626] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Built-in Rules by Category */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                Built-in Rules ({enabledRuleIds.size}/{builtInRules.length})
              </h3>
              <button
                type="button"
                onClick={onResetBuiltInRules}
                className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#111827] cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset defaults</span>
              </button>
            </div>

            {CATEGORY_ORDER.map(({ key, title }) => {
              const items = builtInRules.filter((r) => r.category === key);
              if (items.length === 0) return null;
              return (
                <div key={key} className="space-y-2">
                  <h4 className="text-xs font-semibold text-[#111827]">
                    {title}
                  </h4>
                  <div className="space-y-1.5">
                    {items.map((rule) => {
                      const active = enabledRuleIds.has(rule.id);
                      return (
                        <label
                          key={rule.id}
                          className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-[#E5E7EB] hover:bg-[#FAFAFB] transition-colors cursor-pointer"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => onToggleRule(rule.id)}
                              className="mt-0.5 rounded border-[#D1D5DB]"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[#111827]">
                                {rule.label}
                              </div>
                              {rule.description && (
                                <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                                  {rule.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#3730A3] shrink-0">
                            [{rule.placeholderPrefix}_1]
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
