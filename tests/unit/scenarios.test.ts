import { describe, expect, it } from 'vitest';
import { createDefaultEngine } from '@/core/engine';

// Dynamically assembled synthetic tokens so GitHub Push Protection never falsely blocks commits
const SYNTH_STRIPE_LIVE = ['sk_live_', '51NxYzAbCdEfGhIjKlMnOpQrStUvWx'].join('');
const SYNTH_SENDGRID = [
  'SG.',
  'abcdefghijklmnopqrstuv',
  '.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefg',
].join('');
const SYNTH_SLACK_WEBHOOK = [
  'https://hooks.slack.com',
  '/services/T00000001/B00000002/aBcDeFgHiJkLmNoPqRsTuVwX',
].join('');

describe('Real-World Multi-Domain Scenarios, Boundary Cases & False-Positive Protection', () => {
  const engine = createDefaultEngine();

  it('Scenario 1: Finance & Banking — catches all card brands & Swiss/PT/DE IBANs with zero false positives on numeric controls', () => {
    const input = `Q3 Wire & Card Audit:
- Visa: 4532-0151-1283-0366 | MC: 5105 1051 0510 5100 | Amex: 3782-822463-10005 | Discover: 6011111111111117
- Swiss IBAN: CH93 0076 2011 6238 5295 7
- Portuguese IBAN: PT50 0002 0123 1234 5678 9015 4
- German IBAN: DE89 3704 0044 0532 0130 00
- SWIFT/BIC: DEUTDEFF500 | UK Phone: +44 (0) 20 7946 0958 | DE Phone: +49 (0) 30 901820
- Non-sensitive controls:
  Order #1234567890123452
  Budget delta: +123.4567890 USD | Invoice: INV-2026-0042 | Date: 2026-11-27
  Row values: 100 200 3000 | Price: $1,250.00`;

    const res = engine.sanitizeTextSync(input);

    // Zero sensitive leaks
    const mustRedact = [
      '4532-0151-1283-0366',
      '5105 1051 0510 5100',
      '3782-822463-10005',
      '6011111111111117',
      'CH93 0076 2011 6238 5295 7',
      'PT50 0002 0123 1234 5678 9015 4',
      'DE89 3704 0044 0532 0130 00',
      'DEUTDEFF500',
      '+44 (0) 20 7946 0958',
      '+49 (0) 30 901820',
    ];
    for (const secret of mustRedact) {
      expect(res.sanitizedText).not.toContain(secret);
    }

    // Zero false positives on financial controls
    const mustPreserve = [
      'Order #1234567890123452',
      '+123.4567890 USD',
      'INV-2026-0042',
      '2026-11-27',
      '100 200 3000',
      '$1,250.00',
    ];
    for (const safe of mustPreserve) {
      expect(res.sanitizedText).toContain(safe);
    }

    // 100% lossless roundtrip restore
    const restored = engine.restoreText(res.sanitizedText, res.entries);
    expect(restored.restoredText).toBe(input);
    expect(restored.diff.unmatchedCount).toBe(0);
    expect(restored.diff.unknownCount).toBe(0);
  });

  it('Scenario 2: Dev .env, Passwords, Tokens, Webhooks & Auth URLs — zero leaks while keeping JSON valid', () => {
    const input = `OPENAI_API_KEY=sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
ANTHROPIC_API_KEY=sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz
STRIPE_KEY=${SYNTH_STRIPE_LIVE}
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdefghijklmnopqrstuv
SENDGRID_API_KEY=${SYNTH_SENDGRID}
GITLAB_TOKEN=glpat-aBcDeFgHiJkLmNoPqRsT12
HF_TOKEN=hf_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345
NPM_TOKEN=npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
SLACK_WEBHOOK=${SYNTH_SLACK_WEBHOOK}
GIT_REMOTE=https://deploy:MyGitPass123!@git.internal.acme.com/org/app.git
DATABASE_URL=postgres://admin:Sup3rS3cret@10.0.0.12:5432/prod_db
SMTP_PASS=MailPass#99
DB_PWD=ShortP@ss7
SIGNING_KEY=hmac_signing_key_prod_887766
ENCRYPTION_KEY=aes256_master_key_prod_554433
JSON_PW={"password": "P@ss:word;99!", "passphrase": "my secret phrase 2026"}`;

    const res = engine.sanitizeTextSync(input);

    const mustRedact = [
      'sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
      'sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
      'AKIAIOSFODNN7EXAMPLE',
      'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
      SYNTH_STRIPE_LIVE,
      'whsec_1234567890abcdefghijklmnopqrstuv',
      SYNTH_SENDGRID,
      'glpat-aBcDeFgHiJkLmNoPqRsT12',
      'hf_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345',
      'npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
      'hooks.slack.com/services/T00000001',
      'MyGitPass123!',
      'Sup3rS3cret',
      'MailPass#99',
      'ShortP@ss7',
      'hmac_signing_key_prod_887766',
      'aes256_master_key_prod_554433',
      'P@ss:word;99!',
      'my secret phrase 2026',
    ];
    for (const secret of mustRedact) {
      expect(res.sanitizedText).not.toContain(secret);
    }

    // Embedded JSON line remains strictly valid JSON!
    const jsonLine = res.sanitizedText
      .split('\n')
      .find((line) => line.startsWith('JSON_PW='))!
      .slice('JSON_PW='.length);
    const parsed = JSON.parse(jsonLine);
    expect(parsed.password).toMatch(/^\[SECRET_\d+\]$/);
    expect(parsed.passphrase).toMatch(/^\[SECRET_\d+\]$/);

    // 100% lossless roundtrip
    const restored = engine.restoreText(res.sanitizedText, res.entries);
    expect(restored.restoredText).toBe(input);
    expect(restored.diff.unmatchedCount).toBe(0);
  });

  it('Scenario 3: Code False-Positive Torture Test — preserves TS/Python/C++ syntax, package@versions, env refs, and catches hardcoded secrets', () => {
    const input = `// Packages: react@19.1.0, vitest@3.2.7, @types/node@22.0.0, release v1.2.3.4
interface AuthConfig {
  password: string;
  apiKey: string;
  token: undefined;
  maxPasswordLength: number;
}
const cfg = {
  apiKey: process.env.OPENAI_API_KEY,
  password: os.environ["DB_PASSWORD"],
  token: req.headers.authorization,
  secret: getSecret(),
  has_password: true,
  token_ttl: 3600,
  token_type: "Bearer",
  bypass: "allow_all_traffic",
  realHardcodedPass: "ActualProdPass!2026",
  password_real: "HardcodedSecret88",
};
// C++ / Rust scope operators: std::vector, ::add, ::bad, abc::def, time 14:32:08
// Real IPv6: 2001:db8::8a2e:370:7334 and ::ffff:192.168.1.50`;

    const res = engine.sanitizeTextSync(input);

    // Real secrets & real IPv6 MUST be masked
    expect(res.sanitizedText).not.toContain('ActualProdPass!2026');
    expect(res.sanitizedText).not.toContain('HardcodedSecret88');
    expect(res.sanitizedText).not.toContain('2001:db8::8a2e:370:7334');
    expect(res.sanitizedText).not.toContain('::ffff:192.168.1.50');
    expect(res.sanitizedText).not.toContain('.168.1.50');

    // Non-sensitive code constructs MUST remain 100% untouched
    const mustPreserve = [
      'react@19.1.0',
      'vitest@3.2.7',
      '@types/node@22.0.0',
      'v1.2.3.4',
      'password: string;',
      'apiKey: process.env.OPENAI_API_KEY',
      'password: os.environ["DB_PASSWORD"]',
      'token: req.headers.authorization',
      'secret: getSecret()',
      'token_type: "Bearer"',
      'bypass: "allow_all_traffic"',
      'std::vector, ::add, ::bad, abc::def, time 14:32:08',
    ];
    for (const safe of mustPreserve) {
      expect(res.sanitizedText).toContain(safe);
    }

    const restored = engine.restoreText(res.sanitizedText, res.entries);
    expect(restored.restoredText).toBe(input);
  });

  it('Scenario 4: HTTP / cURL / Debug Logs — masks Basic Auth, curl -u, Bearer JWT/tokens, and keeps surrounding call syntax intact', () => {
    const input = `curl -u admin:CurlSecret99! -H "Authorization: Basic dXNlcjpwYXNzd29yZA==" -H "X-API-Key: live_api_key_9988776655" https://api.acme.com/v1/users
2026-11-27T13:00:00Z INFO ip=192.168.1.42 ipv6=fe80::1ff:fe23:4567:890a mac=00:1A:2B:3C:4D:5E
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
Authorization: Bearer opaque_session_token_987654321
connect(postgres://svc:DbPass99@10.0.0.5:5432/app);`;

    const res = engine.sanitizeTextSync(input);

    expect(res.sanitizedText).not.toContain('CurlSecret99!');
    expect(res.sanitizedText).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(res.sanitizedText).not.toContain('live_api_key_9988776655');
    expect(res.sanitizedText).not.toContain('192.168.1.42');
    expect(res.sanitizedText).not.toContain('fe80::1ff:fe23:4567:890a');
    expect(res.sanitizedText).not.toContain('00:1A:2B:3C:4D:5E');
    expect(res.sanitizedText).not.toContain('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(res.sanitizedText).not.toContain('opaque_session_token_987654321');
    expect(res.sanitizedText).not.toContain('DbPass99');

    // Surrounding syntax & non-sensitive URLs preserved cleanly
    expect(res.sanitizedText).toContain('https://api.acme.com/v1/users');
    expect(res.sanitizedText).toContain('connect([DB_URI_1]);');
    expect(res.sanitizedText).toContain('Authorization: Basic [AUTH_CRED_2]');

    const restored = engine.restoreText(res.sanitizedText, res.entries);
    expect(restored.restoredText).toBe(input);
  });

  it('Scenario 5: Bare Standalone Tokens without Key Prefixes — catches Stripe whsec, SendGrid, GitLab, HuggingFace, npm, Slack webhook bare in prose', () => {
    const input = `Please rotate these bare tokens found in a Slack thread:
whsec_1234567890abcdefghijklmnopqrstuv
${SYNTH_SENDGRID}
glpat-aBcDeFgHiJkLmNoPqRsT12
hf_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345
npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
${SYNTH_SLACK_WEBHOOK}`;

    const res = engine.sanitizeTextSync(input);
    expect(res.entries).toHaveLength(6);
    expect(res.entries.map((e) => e.ruleId)).toEqual([
      'stripe_key',
      'sendgrid_key',
      'gitlab_token',
      'huggingface_token',
      'npm_token',
      'slack_webhook',
    ]);

    const restored = engine.restoreText(res.sanitizedText, res.entries);
    expect(restored.restoredText).toBe(input);
  });

  it('Scenario 6: HR / Legal / Support Email with literal [EMAIL_1] collision avoidance and invalid SSN rejection', () => {
    const input = `From: alice.smith@acme-corp.com
CC: bob.jones@acme-corp.com
Employee SSN: 123-45-6789 (Invalid SSA test: 666-12-3456)
Passport No: AB1234567 | Driver's License #: D87654321
Direct: (415) 555-0199 | Intl: +1-800-555-0142
Note: template already mentions [EMAIL_1] literally.`;

    const res = engine.sanitizeTextSync(input);

    expect(res.sanitizedText).toContain('[EMAIL_2]');
    expect(res.sanitizedText).toContain('[EMAIL_3]');
    expect(res.sanitizedText).toContain('666-12-3456'); // invalid SSN ignored
    expect(res.sanitizedText).not.toContain('alice.smith@acme-corp.com');
    expect(res.sanitizedText).not.toContain('123-45-6789');
    expect(res.sanitizedText).not.toContain('AB1234567');
    expect(res.sanitizedText).not.toContain('D87654321');

    const restored = engine.restoreText(res.sanitizedText, res.entries);
    expect(restored.restoredText).toBe(input);
    expect(restored.diff.unmatchedCount).toBe(0);
  });
});
