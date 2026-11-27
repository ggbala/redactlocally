import { describe, expect, it } from 'vitest';
import { createDefaultEngine, SanitizationEngine } from '@/core/engine';
import { resolveOverlaps } from '@/core/placeholder';
import type { CustomRule, DetectedEntity } from '@/core/types';
import { LocalSlmDetectorStub } from '@/detectors/slm-detector.stub';
import { RemoteApiDetectorStub } from '@/detectors/remote-detector.stub';
import { FreeEntitlementProvider } from '@/billing/free-entitlements';

describe('SanitizationEngine — Core Placeholders & Restoration', () => {
  const engine = createDefaultEngine();

  it('maps repeated identical sensitive values to the same deterministic placeholder', () => {
    const email = 'alice@acme.com';
    const input = [
      `From: ${email}`,
      `Reply-To: ${email}`,
      `Owner: ${email}`,
      `Billing: ${email}`,
      `CC: ${email}`,
    ].join('\n');

    const result = engine.sanitizeTextSync(input);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].placeholder).toBe('[EMAIL_1]');
    expect(result.entries[0].originalValue).toBe(email);
    expect(result.entries[0].count).toBe(5);
    expect(result.totalReplacements).toBe(5);
    expect(result.sanitizedText).not.toContain(email);

    const restored = engine.restoreText(result.sanitizedText, result.entries);
    expect(restored.restoredText).toBe(input);
    expect(restored.diff.replacedCount).toBe(5);
    expect(restored.diff.unmatchedCount).toBe(0);
    expect(restored.diff.unknownCount).toBe(0);
  });

  it('handles >10 entities cleanly so [EMAIL_1] never corrupts [EMAIL_10]..[EMAIL_12]', () => {
    const emails = Array.from({ length: 12 }, (_, idx) => `user${idx + 1}@example.org`);
    const input = emails.map((e, idx) => `Line ${idx + 1}: ${e}`).join('\n');

    const sanitized = engine.sanitizeTextSync(input);
    expect(sanitized.entries).toHaveLength(12);
    expect(sanitized.sanitizedText).toContain('[EMAIL_1]');
    expect(sanitized.sanitizedText).toContain('[EMAIL_10]');
    expect(sanitized.sanitizedText).toContain('[EMAIL_12]');
    for (const e of emails) {
      expect(sanitized.sanitizedText).not.toContain(e);
    }

    const restored = engine.restoreText(sanitized.sanitizedText, sanitized.entries);
    expect(restored.restoredText).toBe(input);
    expect(restored.diff.replacedCount).toBe(12);
    expect(restored.diff.replacedUniqueCount).toBe(12);
    expect(restored.diff.unmatchedCount).toBe(0);
    expect(restored.diff.unknownCount).toBe(0);
  });

  it('avoids collisions when source text already contains literal placeholders like [EMAIL_1]', () => {
    const input =
      'Template uses [EMAIL_1] and [EMAIL_3]. Actual contacts: alice@acme.com and bob@acme.com.';

    const sanitized = engine.sanitizeTextSync(input);

    // Must skip 1 and 3, assigning 2 and 4
    expect(sanitized.entries.map((e) => e.placeholder)).toEqual([
      '[EMAIL_2]',
      '[EMAIL_4]',
    ]);
    expect(sanitized.sanitizedText).toBe(
      'Template uses [EMAIL_1] and [EMAIL_3]. Actual contacts: [EMAIL_2] and [EMAIL_4].',
    );

    const restored = engine.restoreText(sanitized.sanitizedText, sanitized.entries);
    expect(restored.restoredText).toBe(input);
    expect(restored.diff.replacedCount).toBe(2);
    expect(restored.diff.unmatchedCount).toBe(0);
  });

  it('never double-replaces when an original value contains another placeholder literal', () => {
    const entries = [
      {
        placeholder: '[CUSTOM_1]',
        originalValue: 'Literal [CUSTOM_2] inside value',
        ruleId: 'user_custom',
        category: 'custom',
        count: 1,
      },
      {
        placeholder: '[CUSTOM_2]',
        originalValue: 'Project Apollo',
        ruleId: 'user_custom',
        category: 'custom',
        count: 1,
      },
    ];

    const restored = engine.restoreText('A=[CUSTOM_1]; B=[CUSTOM_2]', entries);
    expect(restored.restoredText).toBe(
      'A=Literal [CUSTOM_2] inside value; B=Project Apollo',
    );
    expect(restored.diff.replacedCount).toBe(2);
  });

  it('resolves overlapping rules by priority -> longest match -> earliest offset', () => {
    // 1. Real-world overlap: DB connection URI (priority 95) contains an IPv4 (priority 70)
    const dbInput = 'DATABASE_URL=postgres://admin:SuperSecret99@10.0.0.1:5432/prod_db';
    const dbResult = engine.sanitizeTextSync(dbInput);

    expect(dbResult.entries).toHaveLength(1);
    expect(dbResult.entries[0].ruleId).toBe('db_conn_string');
    expect(dbResult.entries[0].placeholder).toBe('[DB_URI_1]');
    expect(dbResult.sanitizedText).toBe('DATABASE_URL=[DB_URI_1]');

    // 2. Real-world overlap: OpenAI key (priority 90) inside API_KEY=... (priority 70)
    const envInput = 'OPENAI_API_KEY=sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
    const envResult = engine.sanitizeTextSync(envInput);
    expect(envResult.entries).toHaveLength(1);
    expect(envResult.entries[0].ruleId).toBe('openai_key');
    expect(envResult.sanitizedText).toBe('OPENAI_API_KEY=[OPENAI_KEY_1]');

    // 3. Synthetic tie-breakers: same priority -> longer wins; same priority & length -> earlier wins
    const synthetic: DetectedEntity[] = [
      {
        start: 5,
        end: 10,
        rawValue: '12345',
        ruleId: 'short',
        category: 'custom',
        placeholderPrefix: 'A',
        priority: 80,
      },
      {
        start: 3,
        end: 12,
        rawValue: 'xx12345yy',
        ruleId: 'longer',
        category: 'custom',
        placeholderPrefix: 'B',
        priority: 80,
      },
      {
        start: 20,
        end: 25,
        rawValue: 'abcde',
        ruleId: 'earlier',
        category: 'custom',
        placeholderPrefix: 'C',
        priority: 80,
      },
      {
        start: 22,
        end: 27,
        rawValue: 'cdefg',
        ruleId: 'later',
        category: 'custom',
        placeholderPrefix: 'D',
        priority: 80,
      },
    ];

    const resolved = resolveOverlaps(synthetic);
    expect(resolved.map((e) => e.ruleId)).toEqual(['longer', 'earlier']);
  });

  it('computes accurate verification diffs (replaced, unmatchedFromMap, unknownInFile)', () => {
    const input =
      'Primary: alice@acme.com, Backup: bob@acme.com, IP: 10.20.30.40, Key: AKIAIOSFODNN7EXAMPLE';
    const sanitized = engine.sanitizeTextSync(input);
    expect(sanitized.entries).toHaveLength(4);

    // Simulate AI reply that keeps [EMAIL_1] (twice) and [AWS_KEY_1],
    // drops [EMAIL_2] and [IP_1], and hallucinates [EMAIL_99] and [PHONE_7]
    const aiReply =
      'Reviewed [EMAIL_1] (confirmed [EMAIL_1]) and rotated [AWS_KEY_1]. Also check [EMAIL_99] and [PHONE_7].';

    const restored = engine.restoreText(aiReply, sanitized.entries);

    expect(restored.restoredText).toBe(
      'Reviewed alice@acme.com (confirmed alice@acme.com) and rotated AKIAIOSFODNN7EXAMPLE. Also check [EMAIL_99] and [PHONE_7].',
    );

    expect(restored.diff.replacedCount).toBe(3); // 2x [EMAIL_1] + 1x [AWS_KEY_1]
    expect(restored.diff.replacedUniqueCount).toBe(2);
    expect(restored.diff.unmatchedCount).toBe(2);
    expect(restored.diff.unmatchedFromMap.map((u) => u.placeholder)).toEqual([
      '[EMAIL_2]',
      '[IP_1]',
    ]);
    expect(restored.diff.unknownCount).toBe(2);
    expect(restored.diff.unknownUniqueCount).toBe(2);
    expect(restored.diff.unknownInFile).toEqual([
      { placeholder: '[EMAIL_99]', occurrences: 1 },
      { placeholder: '[PHONE_7]', occurrences: 1 },
    ]);
  });

  it('supports user custom exact terms and custom regexes while ignoring invalid regexes safely', () => {
    const customRules: CustomRule[] = [
      {
        id: 'company_name',
        label: 'Company Name',
        mode: 'exact',
        pattern: 'Acme Holdings',
        placeholderPrefix: 'COMPANY',
        caseSensitive: false,
        enabled: true,
      },
      {
        id: 'deal_code',
        label: 'Deal Code',
        mode: 'regex',
        pattern: 'PROJ-[0-9]{4}',
        placeholderPrefix: 'PROJECT',
        caseSensitive: true,
        enabled: true,
      },
      {
        id: 'broken_user_regex',
        label: 'Broken Regex',
        mode: 'regex',
        pattern: '[unclosed(',
        enabled: true,
      },
    ];

    const input = 'Confidential memo for acme holdings regarding PROJ-2026.';
    const sanitized = engine.sanitizeTextSync(input, { customRules });

    expect(sanitized.sanitizedText).toBe(
      'Confidential memo for [COMPANY_1] regarding [PROJECT_1].',
    );
    const restored = engine.restoreText(sanitized.sanitizedText, sanitized.entries);
    expect(restored.restoredText).toBe(input);
  });

  it('maintains consistent placeholders and diff stats across multi-chunk sessions', async () => {
    const chunks = [
      'Sheet 1 row 1: alice@acme.com and 10.0.0.1',
      'Sheet 2 row 5: alice@acme.com and bob@acme.com (literal [EMAIL_1] preserved)',
    ];

    const session = engine.createSession();
    // Pre-scan all chunks so literal [EMAIL_1] in chunk 2 is reserved before chunk 1 allocates
    for (const chunk of chunks) {
      session.reserveExistingPlaceholders(chunk);
    }

    const sanitizedChunks: string[] = [];
    for (const chunk of chunks) {
      sanitizedChunks.push(await session.sanitizeChunk(chunk));
    }

    expect(sanitizedChunks[0]).toBe('Sheet 1 row 1: [EMAIL_2] and [IP_1]');
    expect(sanitizedChunks[1]).toBe(
      'Sheet 2 row 5: [EMAIL_2] and [EMAIL_3] (literal [EMAIL_1] preserved)',
    );

    const summary = session.getSummary();
    expect(summary.totalReplacements).toBe(4);

    const restoreSession = engine.createRestoreSession(summary.entries);
    const restoredChunks = sanitizedChunks.map((c) => restoreSession.restoreChunk(c));
    expect(restoredChunks).toEqual(chunks);

    const diff = restoreSession.finalizeDiff();
    expect(diff.replacedCount).toBe(4);
    expect(diff.unmatchedCount).toBe(0);
  });

  it('keeps future SLM/Remote stubs and billing entitlement seams cleanly decoupled', async () => {
    const slmStub = new LocalSlmDetectorStub();
    const remoteStub = new RemoteApiDetectorStub();

    expect(slmStub.isReady()).toBe(false);
    expect(remoteStub.isReady()).toBe(false);
    await expect(slmStub.init()).rejects.toThrow();
    await expect(remoteStub.init()).rejects.toThrow();

    // Registering unready stubs must not affect V1 detection
    const customEngine = new SanitizationEngine();
    customEngine.registerDetector(slmStub);
    customEngine.registerDetector(remoteStub);

    const res = await customEngine.sanitizeText('Email: ops@acme.com');
    expect(res.sanitizedText).toBe('Email: [EMAIL_1]');

    const entitlements = new FreeEntitlementProvider();
    expect(entitlements.canUse('text_sanitize')).toBe(true);
    expect(entitlements.canUse('doc_sanitize_basic')).toBe(true);
    expect(entitlements.canUse('local_slm_ner')).toBe(false);
    expect(entitlements.canUse('pdf_redaction')).toBe(false);
    expect(entitlements.getLimit('maxFileSizeMB')).toBeGreaterThan(0);
    expect(entitlements.getLicenseState()).toEqual({ tier: 'free', valid: true });
  });
});
