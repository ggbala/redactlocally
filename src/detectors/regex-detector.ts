import type {
  DetectedEntity,
  DetectionContext,
  DetectorProvider,
  RuleConfig,
} from '../core/types';
import { runValidator } from '../core/validators';

interface CompiledRule {
  config: RuleConfig;
  regex: RegExp;
}

function ensureFlags(flags: string, required: readonly string[]): string {
  let result = flags;
  for (const flag of required) {
    if (!result.includes(flag)) {
      result += flag;
    }
  }
  return result;
}

/**
 * Deterministic regex + secondary checksum detector driven by config/rules/*.rules.json.
 */
export class RegexDetector implements DetectorProvider {
  readonly id = 'builtin-regex-detector';
  readonly kind = 'regex' as const;

  private readonly compiledRules: CompiledRule[];

  constructor(rules: readonly RuleConfig[]) {
    this.compiledRules = rules.map((config) => ({
      config,
      regex: new RegExp(config.pattern, ensureFlags(config.flags, ['g', 'd'])),
    }));
  }

  isReady(): boolean {
    return true;
  }

  getRules(): RuleConfig[] {
    return this.compiledRules.map((item) => ({ ...item.config }));
  }

  detect(text: string, context?: DetectionContext): DetectedEntity[] {
    if (!text) {
      return [];
    }

    const enabledRuleIds = context?.enabledRuleIds;
    const entities: DetectedEntity[] = [];

    for (const { config, regex } of this.compiledRules) {
      if (enabledRuleIds) {
        if (!enabledRuleIds.has(config.id)) {
          continue;
        }
      } else if (!config.enabledByDefault) {
        continue;
      }

      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex += 1;
          continue;
        }

        let start = match.index;
        let end = match.index + match[0].length;
        let rawValue = match[0];

        if (config.captureGroup !== undefined) {
          const captured = match[config.captureGroup];
          const indices = match.indices?.[config.captureGroup];
          if (!captured || !indices) {
            continue;
          }
          start = indices[0];
          end = indices[1];
          rawValue = captured;
        }

        if (config.validator !== null && !runValidator(config.validator, rawValue)) {
          continue;
        }

        entities.push({
          start,
          end,
          rawValue,
          ruleId: config.id,
          category: config.category,
          placeholderPrefix: config.placeholderPrefix,
          priority: config.priority,
        });
      }
    }

    return entities;
  }
}
