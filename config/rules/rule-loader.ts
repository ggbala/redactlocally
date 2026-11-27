import piiRules from './pii.rules.json';
import financialRules from './financial.rules.json';
import secretsRules from './secrets.rules.json';
import networkRules from './network.rules.json';
import type {
  BuiltInRuleCategory,
  RuleConfig,
  ValidatorId,
} from '../../src/core/types';

const VALID_CATEGORIES: ReadonlySet<BuiltInRuleCategory> = new Set([
  'pii',
  'financial',
  'secrets',
  'network',
]);

const VALID_VALIDATORS: ReadonlySet<ValidatorId> = new Set([
  'luhn',
  'iban',
  'ssn',
]);

const VALID_REGEX_FLAGS = /^[dgimsuvy]*$/;
const VALID_PREFIX_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export class RuleSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleSchemaError';
  }
}

/**
 * Validates an array of raw JSON rule entries against the RuleConfig contract.
 * Throws RuleSchemaError with a clear message on any invalid rule or duplicate id.
 */
export function validateRulesSchema(rawRules: unknown): RuleConfig[] {
  if (!Array.isArray(rawRules)) {
    throw new RuleSchemaError('Rule set must be a JSON array.');
  }

  const seenIds = new Set<string>();
  const validated: RuleConfig[] = [];

  for (let idx = 0; idx < rawRules.length; idx++) {
    const item = rawRules[idx];
    if (typeof item !== 'object' || item === null) {
      throw new RuleSchemaError(`Rule at index ${idx} must be an object.`);
    }

    const r = item as Record<string, unknown>;

    if (typeof r.id !== 'string' || r.id.trim().length === 0) {
      throw new RuleSchemaError(`Rule at index ${idx} has invalid or empty "id".`);
    }
    if (seenIds.has(r.id)) {
      throw new RuleSchemaError(`Duplicate rule id detected: "${r.id}".`);
    }
    seenIds.add(r.id);

    if (
      typeof r.category !== 'string' ||
      !VALID_CATEGORIES.has(r.category as BuiltInRuleCategory)
    ) {
      throw new RuleSchemaError(
        `Rule "${r.id}" has invalid category: "${String(r.category)}".`,
      );
    }

    if (typeof r.label !== 'string' || r.label.trim().length === 0) {
      throw new RuleSchemaError(`Rule "${r.id}" must define a non-empty "label".`);
    }

    if (
      typeof r.placeholderPrefix !== 'string' ||
      !VALID_PREFIX_PATTERN.test(r.placeholderPrefix)
    ) {
      throw new RuleSchemaError(
        `Rule "${r.id}" has invalid placeholderPrefix "${String(r.placeholderPrefix)}" (must match ^[A-Z][A-Z0-9_]*$).`,
      );
    }

    if (typeof r.pattern !== 'string' || r.pattern.length === 0) {
      throw new RuleSchemaError(`Rule "${r.id}" must define a non-empty regex "pattern".`);
    }

    if (typeof r.flags !== 'string' || !VALID_REGEX_FLAGS.test(r.flags)) {
      throw new RuleSchemaError(`Rule "${r.id}" has invalid regex flags: "${String(r.flags)}".`);
    }

    // Verify pattern compiles cleanly
    try {
      new RegExp(r.pattern, r.flags);
    } catch (err) {
      throw new RuleSchemaError(
        `Rule "${r.id}" has an invalid RegExp: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (
      typeof r.priority !== 'number' ||
      !Number.isFinite(r.priority) ||
      r.priority < 0 ||
      r.priority > 100
    ) {
      throw new RuleSchemaError(
        `Rule "${r.id}" priority must be a finite number between 0 and 100.`,
      );
    }

    if (
      r.validator !== null &&
      (typeof r.validator !== 'string' ||
        !VALID_VALIDATORS.has(r.validator as ValidatorId))
    ) {
      throw new RuleSchemaError(
        `Rule "${r.id}" has unsupported validator "${String(r.validator)}".`,
      );
    }

    if (typeof r.enabledByDefault !== 'boolean') {
      throw new RuleSchemaError(`Rule "${r.id}" must specify boolean "enabledByDefault".`);
    }

    if (typeof r.sampleMatch !== 'string' || r.sampleMatch.length === 0) {
      throw new RuleSchemaError(`Rule "${r.id}" must specify a non-empty "sampleMatch".`);
    }

    if (r.captureGroup !== undefined) {
      if (
        typeof r.captureGroup !== 'number' ||
        !Number.isInteger(r.captureGroup) ||
        r.captureGroup < 1
      ) {
        throw new RuleSchemaError(
          `Rule "${r.id}" captureGroup must be a positive integer when provided.`,
        );
      }
    }

    if (r.description !== undefined && typeof r.description !== 'string') {
      throw new RuleSchemaError(`Rule "${r.id}" description must be a string when provided.`);
    }

    validated.push({
      id: r.id,
      category: r.category as BuiltInRuleCategory,
      label: r.label,
      description: r.description as string | undefined,
      placeholderPrefix: r.placeholderPrefix,
      pattern: r.pattern,
      flags: r.flags,
      priority: r.priority,
      validator: r.validator as ValidatorId | null,
      enabledByDefault: r.enabledByDefault,
      sampleMatch: r.sampleMatch,
      ...(r.captureGroup !== undefined
        ? { captureGroup: r.captureGroup as number }
        : {}),
    });
  }

  return validated;
}

let cachedBuiltInRules: RuleConfig[] | null = null;

/**
 * Loads and validates all declarative built-in rules from config/rules/*.rules.json.
 * Statically bundled so offline single-HTML builds need zero runtime network fetches.
 */
export function loadBuiltInRules(): RuleConfig[] {
  if (!cachedBuiltInRules) {
    const combined = [
      ...piiRules,
      ...financialRules,
      ...secretsRules,
      ...networkRules,
    ];
    cachedBuiltInRules = validateRulesSchema(combined);
  }
  return cachedBuiltInRules.map((rule) => ({ ...rule }));
}

export function getDefaultEnabledRuleIds(rules: readonly RuleConfig[] = loadBuiltInRules()): Set<string> {
  return new Set(rules.filter((r) => r.enabledByDefault).map((r) => r.id));
}
