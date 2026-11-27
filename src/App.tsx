import { useMemo, useState } from 'react';
import {
  getDefaultEnabledRuleIds,
  loadBuiltInRules,
} from '@config/rules/rule-loader';
import { createDefaultEngine } from '@/core/engine';
import type { CustomRule } from '@/core/types';
import { TrustBanner } from '@/ui/layout/TrustBanner';
import { Header } from '@/ui/layout/Header';
import {
  SegmentedController,
  type WorkspaceMode,
} from '@/ui/layout/SegmentedController';
import { Footer } from '@/ui/layout/Footer';
import { RulesDrawer } from '@/ui/rules-drawer/RulesDrawer';
import { TextWorkspace } from '@/ui/text-mode/TextWorkspace';
import { DocModeContainer } from '@/ui/doc-mode/DocModeContainer';
import { FolderScanWorkspace } from '@/ui/folder-mode/FolderScanWorkspace';
import { HowItWorks } from '@/ui/seo-sections/HowItWorks';
import { SupportedRulesShowcase } from '@/ui/seo-sections/SupportedRulesShowcase';
import { FaqAccordion } from '@/ui/seo-sections/FaqAccordion';

export function App() {
  const builtInRules = useMemo(() => loadBuiltInRules(), []);
  const engine = useMemo(
    () => createDefaultEngine(builtInRules),
    [builtInRules],
  );

  const [mode, setMode] = useState<WorkspaceMode>('text');
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [enabledRuleIds, setEnabledRuleIds] = useState<Set<string>>(() =>
    getDefaultEnabledRuleIds(builtInRules),
  );
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);

  const handleToggleRule = (ruleId: string) => {
    setEnabledRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  const handleResetBuiltInRules = () => {
    setEnabledRuleIds(getDefaultEnabledRuleIds(builtInRules));
  };

  const handleAddCustomRule = (rule: CustomRule) => {
    setCustomRules((prev) => [...prev, rule]);
  };

  const handleToggleCustomRule = (id: string) => {
    setCustomRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const handleRemoveCustomRule = (id: string) => {
    setCustomRules((prev) => prev.filter((r) => r.id !== id));
  };

  const activeCustomCount = customRules.filter((r) => r.enabled).length;

  return (
    <div className="min-h-screen text-[#0F172A] flex flex-col">
      {/* Top Zero-Egress Data Security Banner */}
      <TrustBanner />

      {/* Compact Brand Header + High-Frequency Actions */}
      <Header
        activeRulesCount={enabledRuleIds.size}
        customRulesCount={activeCustomCount}
        onOpenRules={() => setRulesDrawerOpen(true)}
      />

      {/* Unified max-w-[1080px] Column Ensuring Strict 100% Equal Width Alignment */}
      <main className="flex-1 max-w-[1080px] w-full mx-auto px-4">
        <div className="space-y-4">
          <SegmentedController mode={mode} onChange={setMode} />

          {/* Keep both workspaces mounted so switching modes preserves local state */}
          <div className={mode === 'text' ? 'block' : 'hidden'}>
            <TextWorkspace
              engine={engine}
              enabledRuleIds={enabledRuleIds}
              customRules={customRules}
            />
          </div>

          <div className={mode === 'document' ? 'block' : 'hidden'}>
            <DocModeContainer
              engine={engine}
              enabledRuleIds={enabledRuleIds}
              customRules={customRules}
            />
          </div>

          <div className={mode === 'folder' ? 'block' : 'hidden'}>
            <FolderScanWorkspace
              engine={engine}
              builtInRules={builtInRules}
              enabledRuleIds={enabledRuleIds}
              customRules={customRules}
            />
          </div>
        </div>

        {/* Below-the-Fold Structured SEO Sections */}
        <HowItWorks />
        <SupportedRulesShowcase builtInRules={builtInRules} />
        <FaqAccordion />
      </main>

      {/* Slide-over Rules & Custom Terms Drawer */}
      <RulesDrawer
        open={rulesDrawerOpen}
        onClose={() => setRulesDrawerOpen(false)}
        builtInRules={builtInRules}
        enabledRuleIds={enabledRuleIds}
        onToggleRule={handleToggleRule}
        onResetBuiltInRules={handleResetBuiltInRules}
        customRules={customRules}
        onAddCustomRule={handleAddCustomRule}
        onToggleCustomRule={handleToggleCustomRule}
        onRemoveCustomRule={handleRemoveCustomRule}
      />

      {/* Open Source MIT Footer */}
      <Footer />
    </div>
  );
}

export default App;
