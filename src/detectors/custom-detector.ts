import type {
  CustomRule,
  DetectedEntity,
  DetectionContext,
  DetectorProvider,
} from '../core/types';

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePrefix(prefix?: string): string {
  if (!prefix) {
    return 'CUSTOM';
  }
  const cleaned = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned && /^[A-Z]/.test(cleaned) ? cleaned : 'CUSTOM';
}

function buildCustomRegex(rule: CustomRule): RegExp | null {
  const trimmed = rule.pattern.trim();
  if (!trimmed) {
    return null;
  }

  const flags = rule.caseSensitive ? 'g' : 'gi';

  if (rule.mode === 'exact') {
    const escaped = escapeRegexLiteral(trimmed);
    const startsWithWord = /^[A-Za-z0-9_]/.test(trimmed);
    const endsWithWord = /[A-Za-z0-9_]$/.test(trimmed);
    const pattern = `${startsWithWord ? '\\b' : ''}${escaped}${endsWithWord ? '\\b' : ''}`;
    return new RegExp(pattern, flags);
  }

  try {
    return new RegExp(trimmed, flags);
  } catch {
    return null;
  }
}

/**
 * Detector for user-defined exact terms (company names, project codenames) and custom regexes.
 */
export class CustomDetector implements DetectorProvider {
  readonly id = 'user-custom-detector';
  readonly kind = 'custom' as const;

  private readonly defaultCustomRules: readonly CustomRule[];

  constructor(customRules: readonly CustomRule[] = []) {
    this.defaultCustomRules = customRules;
  }

  isReady(): boolean {
    return true;
  }

  detect(text: string, context?: DetectionContext): DetectedEntity[] {
    if (!text) {
      return [];
    }

    const rules = context?.customRules ?? this.defaultCustomRules;
    if (!rules || rules.length === 0) {
      return [];
    }

    const entities: DetectedEntity[] = [];

    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }

      const regex = buildCustomRegex(rule);
      if (!regex) {
        continue;
      }

      const placeholderPrefix = normalizePrefix(rule.placeholderPrefix);
      const priority = rule.priority ?? 98;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex += 1;
          continue;
        }

        entities.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          ruleId: rule.id || 'user_custom',
          category: 'custom',
          placeholderPrefix,
          priority,
        });
      }
    }

    return entities;
  }
}
