import { FileSpreadsheet, FileText, FolderSearch } from 'lucide-react';

export type WorkspaceMode = 'text' | 'document' | 'folder';

interface SegmentedControllerProps {
  mode: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
}

const TABS: ReadonlyArray<{
  id: WorkspaceMode;
  label: string;
  testId: string;
  Icon: typeof FileText;
}> = [
  {
    id: 'text',
    label: 'Text Sanitizer',
    testId: 'tab-text-mode',
    Icon: FileText,
  },
  {
    id: 'document',
    label: 'Document Sanitizer',
    testId: 'tab-doc-mode',
    Icon: FileSpreadsheet,
  },
  {
    id: 'folder',
    label: 'Directory Scanner',
    testId: 'tab-folder-mode',
    Icon: FolderSearch,
  },
];

/**
 * Top-level 3-tab pill segmented controller.
 * Strictly 100% equal in width to the main functional workspace container directly below it.
 */
export function SegmentedController({
  mode,
  onChange,
}: SegmentedControllerProps) {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.id === mode),
  );

  return (
    <div
      data-testid="mode-segmented-controller"
      role="tablist"
      aria-label="Workspace mode"
      className="relative w-full p-1 rounded-full bg-[#E2E8F0]/75 border border-[#CBD5E1]/90 grid grid-cols-3"
    >
      {/* Animated floating active pill (1/3 width) */}
      <div
        aria-hidden="true"
        style={{
          transform: `translateX(${activeIndex * 100}%)`,
        }}
        className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-full bg-white shadow-sm ring-1 ring-[#2563EB]/20 transition-transform duration-200 ease-out"
      />

      {TABS.map(({ id, label, testId, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={testId}
            onClick={() => onChange(id)}
            className={`relative z-10 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-4 rounded-full text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
              active
                ? 'text-[#1D4ED8]'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Icon
              className={`w-4 h-4 shrink-0 ${
                active ? 'text-[#2563EB]' : 'text-[#64748B]'
              }`}
            />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
