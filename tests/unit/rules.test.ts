import { describe, expect, it } from 'vitest';
import {
  RuleSchemaError,
  getDefaultEnabledRuleIds,
  loadBuiltInRules,
  validateRulesSchema,
} from '@config/rules/rule-loader';
import { RegexDetector } from '@/detectors/regex-detector';
import { isValidIban, isValidLuhn, isValidSsn } from '@/core/validators';

// Assemble synthetic provider-shaped test tokens dynamically so GitHub Push Protection
// never falsely blocks commits/PRs while keeping identical runtime test coverage.
const SYNTH_SLACK_WEBHOOK_1 = [
  'https://hooks.slack.com',
  '/services/T00000001/B00000002/aBcDeFgHiJkLmNoPqRsTuVwX',
].join('');
const SYNTH_SLACK_WEBHOOK_2 = [
  'https://hooks.slack.com',
  '/services/T123456789/B987654321/0123456789abcdefghijklm',
].join('');
const SYNTH_STRIPE_LIVE = ['sk_live_', '51NxYzAbCdEfGhIjKlMnOpQrStUvWx'].join('');
const SYNTH_SLACK_BOT = [
  'xox',
  'b-123456789012-123456789012-aBcDeFgHiJkLmNoPqRsTuVwX',
].join('');
const SYNTH_SENDGRID = [
  'SG.',
  'abcdefghijklmnopqrstuv',
  '.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefg',
].join('');

interface RuleTestSpec {
  positives: Array<{ input: string; expectedValue: string }>;
  negatives: string[];
}

/**
 * Mandatory >=3 true-positive and >=3 false-positive cases for EVERY rule in config/rules/*.rules.json.
 */
const RULE_TEST_CASES: Record<string, RuleTestSpec> = {
  // === PII ===
  email: {
    positives: [
      { input: 'Contact alice.smith@acme-corp.com for invoice.', expectedValue: 'alice.smith@acme-corp.com' },
      { input: 'CC: dev+alerts@sub.example.co.uk', expectedValue: 'dev+alerts@sub.example.co.uk' },
      { input: 'user_99@company.io', expectedValue: 'user_99@company.io' },
      { input: 'mailto:finance@munchen.xn--p1ai', expectedValue: 'finance@munchen.xn--p1ai' },
    ],
    negatives: [
      'Visit example.com for more details.',
      'Local handle @alice without domain',
      'Broken email user@localhost or user@.com',
      'npm packages react@19.1.0 and vitest@3.2.7 and @types/node@22.0.0',
    ],
  },
  phone_intl: {
    positives: [
      { input: 'Call +1-415-555-0199 today', expectedValue: '+1-415-555-0199' },
      { input: 'UK Office: +44 (0) 20 7946 0958', expectedValue: '+44 (0) 20 7946 0958' },
      { input: 'DE Office: +49 (0) 30 901820', expectedValue: '+49 (0) 30 901820' },
      { input: 'Direct line: (415) 555-0142', expectedValue: '(415) 555-0142' },
      { input: 'Support: 800-555-0199 and 415.555.0199', expectedValue: '800-555-0199' },
    ],
    negatives: [
      'Order ID: 1234567890',
      'Date: 2026-11-27',
      'SSN: 123-45-6789',
      'Budget delta: +123.4567890 USD',
      'Row values: 100 200 3000 and 000-000-0000',
      'Version v1.2.3.4 and ref INV-2026-0042',
    ],
  },
  ssn_us: {
    positives: [
      { input: 'Employee SSN: 123-45-6789', expectedValue: '123-45-6789' },
      { input: 'Taxpayer 899-99-0001 confirmed', expectedValue: '899-99-0001' },
      { input: 'ID 001-01-0001 on file', expectedValue: '001-01-0001' },
    ],
    negatives: [
      'Invalid area 000-12-3456',
      'Invalid area 666-12-3456 and 900-12-3456',
      'Invalid group/serial 123-00-6789 and 123-45-0000',
    ],
  },
  passport_id: {
    positives: [
      { input: 'Passport No: AB1234567', expectedValue: 'AB1234567' },
      { input: 'National ID Number: 987654321', expectedValue: '987654321' },
      { input: "Driver's License #: D87654321", expectedValue: 'D87654321' },
    ],
    negatives: [
      'Passport expired in 2026',
      'Please bring your passport to the airport.',
      'Random product code AB1234567 without label',
    ],
  },

  // === FINANCIAL ===
  credit_card: {
    positives: [
      { input: 'Visa: 4532-0151-1283-0366', expectedValue: '4532-0151-1283-0366' },
      { input: 'Mastercard 5105 1051 0510 5100', expectedValue: '5105 1051 0510 5100' },
      { input: 'Amex 3782-822463-10005 charged', expectedValue: '3782-822463-10005' },
      { input: 'Discover 6011111111111117 verified', expectedValue: '6011111111111117' },
    ],
    negatives: [
      'Non-Luhn 16-digit order ID: 1234567812345678',
      'Non-card Luhn-passing ID starting with 1: 1234567890123452',
      'All zeros: 0000 0000 0000 0000',
      'Short numeric ref: 4532-0151-128',
    ],
  },
  iban: {
    positives: [
      { input: 'DE account: DE89 3704 0044 0532 0130 00', expectedValue: 'DE89 3704 0044 0532 0130 00' },
      { input: 'UK IBAN GB29NWBK60161331926819', expectedValue: 'GB29NWBK60161331926819' },
      { input: 'Swiss IBAN: CH93 0076 2011 6238 5295 7', expectedValue: 'CH93 0076 2011 6238 5295 7' },
      { input: 'Portuguese IBAN: PT50 0002 0123 1234 5678 9015 4', expectedValue: 'PT50 0002 0123 1234 5678 9015 4' },
    ],
    negatives: [
      'Invalid checksum: DE00 3704 0044 0532 0130 00',
      'Wrong country length: DE89 3704 0044 0532 0130',
      'Unknown country code: ZZ89 3704 0044 0532 0130 00',
    ],
  },
  swift_bic: {
    positives: [
      { input: 'SWIFT: DEUTDEFF500', expectedValue: 'DEUTDEFF500' },
      { input: 'BIC/SWIFT Code: CHASUS33', expectedValue: 'CHASUS33' },
      { input: 'Bank Identifier Code: BNPAFRPPXXX', expectedValue: 'BNPAFRPPXXX' },
    ],
    negatives: [
      'SWIFT: transfer pending',
      'Swift programming language tutorial',
      'BIC: 12345678',
    ],
  },

  // === SECRETS ===
  private_key_block: {
    positives: [
      {
        input: 'Key:\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----\ndone',
        expectedValue: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----',
      },
      {
        input: '-----BEGIN RSA PRIVATE KEY-----\nABC123XYZ\n-----END RSA PRIVATE KEY-----',
        expectedValue: '-----BEGIN RSA PRIVATE KEY-----\nABC123XYZ\n-----END RSA PRIVATE KEY-----',
      },
      {
        input: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE=\n-----END OPENSSH PRIVATE KEY-----',
        expectedValue: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE=\n-----END OPENSSH PRIVATE KEY-----',
      },
    ],
    negatives: [
      '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----',
      '-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----',
      'Unclosed -----BEGIN PRIVATE KEY----- without end marker',
    ],
  },
  db_conn_string: {
    positives: [
      { input: 'DATABASE_URL=postgres://admin:Sup3rS3cret@10.0.0.12:5432/prod_db', expectedValue: 'postgres://admin:Sup3rS3cret@10.0.0.12:5432/prod_db' },
      { input: 'uri = "mongodb+srv://svc:p4ssw0rd@cluster0.xyz.mongodb.net/app"', expectedValue: 'mongodb+srv://svc:p4ssw0rd@cluster0.xyz.mongodb.net/app' },
      { input: 'connect(redis://:myRedisPass99@127.0.0.1:6379/0);', expectedValue: 'redis://:myRedisPass99@127.0.0.1:6379/0' },
      { input: 'GIT_REMOTE=https://deploy:MyGitPass123!@git.internal.acme.com/org/app.git', expectedValue: 'https://deploy:MyGitPass123!@git.internal.acme.com/org/app.git' },
    ],
    negatives: [
      'postgres://localhost:5432/dev_without_creds',
      'https://api.example.com/v1/users',
      'Connect to postgres database on port 5432',
    ],
  },
  slack_webhook: {
    positives: [
      {
        input: `SLACK_WEBHOOK=${SYNTH_SLACK_WEBHOOK_1}`,
        expectedValue: SYNTH_SLACK_WEBHOOK_1,
      },
      {
        input: `Notify ${SYNTH_SLACK_WEBHOOK_2}`,
        expectedValue: SYNTH_SLACK_WEBHOOK_2,
      },
      {
        input: 'DISCORD=https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH',
        expectedValue: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH',
      },
    ],
    negatives: [
      'https://hooks.slack.com/docs/incoming-webhooks',
      'https://slack.com/api/chat.postMessage',
      'https://discord.com/developers/docs/resources/webhook',
    ],
  },
  anthropic_key: {
    positives: [
      { input: 'ANTHROPIC_API_KEY=sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789', expectedValue: 'sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789' },
      { input: 'key: sk-ant-1234567890abcdefghijklmnop', expectedValue: 'sk-ant-1234567890abcdefghijklmnop' },
      { input: 'token="sk-ant-api01-ZZZZZZZZZZZZZZZZZZZZZZ"', expectedValue: 'sk-ant-api01-ZZZZZZZZZZZZZZZZZZZZZZ' },
    ],
    negatives: [
      'sk-ant-short123',
      'sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
      SYNTH_STRIPE_LIVE,
    ],
  },
  openai_key: {
    positives: [
      { input: 'OPENAI_API_KEY=sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789', expectedValue: 'sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789' },
      { input: 'legacy key sk-1234567890abcdefghijklmnop', expectedValue: 'sk-1234567890abcdefghijklmnop' },
      { input: 'svc key sk-svcacct-AbCdEfGhIjKlMnOpQrStUvWxYz', expectedValue: 'sk-svcacct-AbCdEfGhIjKlMnOpQrStUvWxYz' },
    ],
    negatives: [
      'sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
      'sk-short12345',
      SYNTH_STRIPE_LIVE,
    ],
  },
  aws_access_key: {
    positives: [
      { input: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', expectedValue: 'AKIAIOSFODNN7EXAMPLE' },
      { input: 'Temp key ASIA1234567890ABCDEF', expectedValue: 'ASIA1234567890ABCDEF' },
      { input: 'key: "ABIA9876543210FEDCBA"', expectedValue: 'ABIA9876543210FEDCBA' },
    ],
    negatives: [
      'AKIA12345 (too short)',
      'akiaiosfodnn7example (lowercase)',
      'XKIAIOSFODNN7EXAMPLE (invalid prefix)',
    ],
  },
  aws_secret_access_key: {
    positives: [
      { input: 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', expectedValue: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
      { input: '"aws_secret_access_key": "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/=="', expectedValue: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/==' },
      { input: 'aws_secret_key: 0123456789abcdef0123456789abcdef01234567', expectedValue: '0123456789abcdef0123456789abcdef01234567' },
    ],
    negatives: [
      'AWS_SECRET_ACCESS_KEY=too_short_key',
      'RANDOM_HASH=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'AWS_SECRET_ACCESS_KEY=""',
    ],
  },
  github_token: {
    positives: [
      { input: 'GH_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz', expectedValue: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' },
      { input: 'oauth gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', expectedValue: 'gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' },
      { input: 'fine-grained github_pat_11ABCDEFG0123456789_abcdefg1234567890', expectedValue: 'github_pat_11ABCDEFG0123456789_abcdefg1234567890' },
    ],
    negatives: [
      'ghp_short12345',
      'ghx_1234567890abcdefghijklmnopqrstuvwxyz',
      'github_pat_short',
    ],
  },
  gitlab_token: {
    positives: [
      { input: 'GITLAB_TOKEN=glpat-aBcDeFgHiJkLmNoPqRsT12', expectedValue: 'glpat-aBcDeFgHiJkLmNoPqRsT12' },
      { input: 'Use glpat-0123456789_abcdefghij-99 to clone', expectedValue: 'glpat-0123456789_abcdefghij-99' },
      { input: '"token": "glpat-ZZZZZZZZZZZZZZZZZZZZZZ"', expectedValue: 'glpat-ZZZZZZZZZZZZZZZZZZZZZZ' },
    ],
    negatives: [
      'glpat-short123',
      'gitlab-token-placeholder',
      'xglpat-aBcDeFgHiJkLmNoPqRsT12',
    ],
  },
  stripe_key: {
    positives: [
      { input: `STRIPE_KEY=${SYNTH_STRIPE_LIVE}`, expectedValue: SYNTH_STRIPE_LIVE },
      { input: 'restricted rk_live_9876543210abcdefghijkl', expectedValue: 'rk_live_9876543210abcdefghijkl' },
      { input: 'publishable pk_test_ABCDEF0123456789abcdef', expectedValue: 'pk_test_ABCDEF0123456789abcdef' },
      { input: 'webhook whsec_1234567890abcdefghijklmnopqrstuv', expectedValue: 'whsec_1234567890abcdefghijklmnopqrstuv' },
    ],
    negatives: [
      'sk_live_short123',
      'sk_dev_51NxYzAbCdEfGhIjKlMnOpQrStUvWx',
      'whsec_short123',
    ],
  },
  slack_token: {
    positives: [
      { input: `SLACK_BOT=${SYNTH_SLACK_BOT}`, expectedValue: SYNTH_SLACK_BOT },
      { input: 'user xoxp-9999999999-8888888888-abcdef1234', expectedValue: 'xoxp-9999999999-8888888888-abcdef1234' },
      { input: 'app xoxa-2-1234567890abcdef', expectedValue: 'xoxa-2-1234567890abcdef' },
    ],
    negatives: [
      'xoxb-short',
      'xoxz-123456789012-123456789012',
      'slack_token_placeholder',
    ],
  },
  google_api_key: {
    positives: [
      { input: 'GCP_KEY=AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe', expectedValue: 'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe' },
      { input: '"apiKey": "AIza0123456789abcdefGHIJKLMNOPQRSTUV_-9"', expectedValue: 'AIza0123456789abcdefGHIJKLMNOPQRSTUV_-9' },
      { input: 'key=AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', expectedValue: 'AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    ],
    negatives: [
      'AIzaTooShort12345',
      'BIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe',
      'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQeEXTRA',
    ],
  },
  sendgrid_key: {
    positives: [
      {
        input: `SENDGRID_API_KEY=${SYNTH_SENDGRID}`,
        expectedValue: SYNTH_SENDGRID,
      },
      {
        input: 'key: "SG.0123456789abcdef1234.0123456789abcdefghijklmnopqrstuvwxyz"',
        expectedValue: 'SG.0123456789abcdef1234.0123456789abcdefghijklmnopqrstuvwxyz',
      },
      {
        input: 'SG.aBcDeFgHiJkLmNoP_-12.9876543210ZyXwVuTsRqPoNmLkJiHg',
        expectedValue: 'SG.aBcDeFgHiJkLmNoP_-12.9876543210ZyXwVuTsRqPoNmLkJiHg',
      },
    ],
    negatives: [
      'SG.short.too_short',
      'MSG.abcdefghijklmnopqrstuv.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefg',
      'SG.only_two_segments',
    ],
  },
  huggingface_token: {
    positives: [
      { input: 'HF_TOKEN=hf_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345', expectedValue: 'hf_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345' },
      { input: 'Use hf_0123456789abcdefghijklmnop for downloads', expectedValue: 'hf_0123456789abcdefghijklmnop' },
      { input: '"hf": "hf_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"', expectedValue: 'hf_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' },
    ],
    negatives: [
      'hf_short123',
      'my_hf_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345',
      'hf-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345',
    ],
  },
  npm_token: {
    positives: [
      { input: '//registry.npmjs.org/:_authToken=npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789', expectedValue: 'npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789' },
      { input: 'NPM_TOKEN=npm_0123456789abcdefghijklmnopqrstuvwxyz', expectedValue: 'npm_0123456789abcdefghijklmnopqrstuvwxyz' },
      { input: 'npm_ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567', expectedValue: 'npm_ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567' },
    ],
    negatives: [
      'npm_short_token',
      'npm_run_build_script',
      'mynpm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
    ],
  },
  jwt_token: {
    positives: [
      {
        input: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        expectedValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      },
      {
        input: 'token="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJhdXRoMCJ9.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"',
        expectedValue: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJhdXRoMCJ9.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      },
      {
        input: 'eyJhbGciOiJFUzI1NiJ9.eyJ1aWQiOjQyLCJyb2xlIjoiYWRtaW4ifQ.abcDEF1234567890_-',
        expectedValue: 'eyJhbGciOiJFUzI1NiJ9.eyJ1aWQiOjQyLCJyb2xlIjoiYWRtaW4ifQ.abcDEF1234567890_-',
      },
    ],
    negatives: [
      'not.a.jwt',
      'eyJhbGciOiJIUzI1NiJ9.missing_signature_segment',
      'eyJ123.eyJ456.short',
    ],
  },
  http_auth_cred: {
    positives: [
      { input: 'Authorization: Basic dXNlcjpwYXNzd29yZA==', expectedValue: 'dXNlcjpwYXNzd29yZA==' },
      { input: 'curl -u admin:CurlSecret99! https://api.acme.com', expectedValue: 'admin:CurlSecret99!' },
      { input: 'curl --user "svc_bot:TopSecret#2026" https://internal.corp', expectedValue: 'svc_bot:TopSecret#2026' },
    ],
    negatives: [
      'Authorization: Bearer some_token_12345',
      'curl -u admin https://api.acme.com',
      'Basic authentication overview guide',
    ],
  },
  generic_secret_quoted: {
    positives: [
      { input: '{"password": "P@ss:word;99!"}', expectedValue: 'P@ss:word;99!' },
      { input: '{"passphrase": "my secret phrase 2026"}', expectedValue: 'my secret phrase 2026' },
      { input: 'realHardcodedPass: "ActualProdPass!2026"', expectedValue: 'ActualProdPass!2026' },
      { input: 'password_real = "HardcodedSecret88"', expectedValue: 'HardcodedSecret88' },
    ],
    negatives: [
      '{"password": "${DB_PASSWORD}"}',
      '{"token_type": "Bearer", "password_reset_url": "https://example.com/reset"}',
      'const bypass = "allow_all_traffic"; const compass = "north_west";',
      '{"apiKey": "changeme", "password": "[SECRET_1]"}',
    ],
  },
  generic_secret_kv: {
    positives: [
      { input: 'API_KEY=prod_secret_9876543210', expectedValue: 'prod_secret_9876543210' },
      { input: 'SMTP_PASS=MailPass#99', expectedValue: 'MailPass#99' },
      { input: 'DB_PWD=ShortP@ss7', expectedValue: 'ShortP@ss7' },
      { input: 'Authorization: Bearer opaque_token_abc123456789', expectedValue: 'opaque_token_abc123456789' },
    ],
    negatives: [
      'apiKey: process.env.OPENAI_API_KEY',
      'password: os.environ["DB_PASSWORD"]',
      'secret: getSecret()',
      'password: string; has_password = true; API_KEY=[SECRET_1]',
    ],
  },

  // === NETWORK ===
  ipv4: {
    positives: [
      { input: 'Server IP: 192.168.1.42', expectedValue: '192.168.1.42' },
      { input: 'Connect to 10.0.0.1:5432', expectedValue: '10.0.0.1' },
      { input: 'DNS 8.8.8.8 and gateway 172.16.254.1', expectedValue: '8.8.8.8' },
    ],
    negatives: [
      'Release version v1.2.3.4 deployed',
      'Invalid octets 256.1.1.1 and 999.0.0.1',
      'OID 1.2.3.4.5 is not IPv4',
    ],
  },
  ipv6: {
    positives: [
      { input: 'Host: 2001:0db8:85a3:0000:0000:8a2e:0370:7334', expectedValue: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' },
      { input: 'Compressed: 2001:db8::8a2e:370:7334', expectedValue: '2001:db8::8a2e:370:7334' },
      { input: 'Link-local fe80::1ff:fe23:4567:890a', expectedValue: 'fe80::1ff:fe23:4567:890a' },
      { input: 'IPv4-mapped ::ffff:192.168.1.50', expectedValue: '::ffff:192.168.1.50' },
    ],
    negatives: [
      'Timestamp 14:32:08 UTC',
      'C++ scope operators std::vector, ::add, ::bad, abc::def',
      'MAC 00:1A:2B:3C:4D:5E',
    ],
  },
  mac_address: {
    positives: [
      { input: 'eth0 HWaddr 00:1A:2B:3C:4D:5E', expectedValue: '00:1A:2B:3C:4D:5E' },
      { input: 'Adapter aa-bb-cc-dd-ee-ff online', expectedValue: 'aa-bb-cc-dd-ee-ff' },
      { input: 'MAC=08:00:27:8e:75:12', expectedValue: '08:00:27:8e:75:12' },
    ],
    negatives: [
      'Timestamp 14:32:08',
      'Invalid hex 00:1A:2B:3C:4D:5G',
      'Too many octets 00:1A:2B:3C:4D:5E:6F',
      'Mixed separators 00:1A-2B:3C-4D:5E',
    ],
  },
};

describe('Built-in Rules Schema & Loader', () => {
  const rules = loadBuiltInRules();

  it('loads all built-in rules cleanly with valid schema and unique IDs', () => {
    expect(rules.length).toBeGreaterThanOrEqual(29);
    const ids = new Set(rules.map((r) => r.id));
    expect(ids.size).toBe(rules.length);
    expect(getDefaultEnabledRuleIds(rules).size).toBe(rules.length);
  });

  it('rejects malformed rules via validateRulesSchema', () => {
    expect(() => validateRulesSchema('not-an-array')).toThrow(RuleSchemaError);
    expect(() =>
      validateRulesSchema([
        {
          id: 'bad_cat',
          category: 'unknown',
          label: 'Bad',
          placeholderPrefix: 'BAD',
          pattern: 'abc',
          flags: 'g',
          priority: 50,
          validator: null,
          enabledByDefault: true,
          sampleMatch: 'abc',
        },
      ]),
    ).toThrow(RuleSchemaError);

    expect(() =>
      validateRulesSchema([
        {
          id: 'bad_regex',
          category: 'pii',
          label: 'Bad Regex',
          placeholderPrefix: 'BAD',
          pattern: '[unclosed',
          flags: 'g',
          priority: 50,
          validator: null,
          enabledByDefault: true,
          sampleMatch: 'abc',
        },
      ]),
    ).toThrow(RuleSchemaError);

    expect(() =>
      validateRulesSchema([
        {
          id: 'dup',
          category: 'pii',
          label: 'A',
          placeholderPrefix: 'A',
          pattern: 'a',
          flags: 'g',
          priority: 50,
          validator: null,
          enabledByDefault: true,
          sampleMatch: 'a',
        },
        {
          id: 'dup',
          category: 'pii',
          label: 'B',
          placeholderPrefix: 'B',
          pattern: 'b',
          flags: 'g',
          priority: 50,
          validator: null,
          enabledByDefault: true,
          sampleMatch: 'b',
        },
      ]),
    ).toThrow(RuleSchemaError);
  });

  it('ensures every built-in rule has explicit TP/FP test coverage and matches its sampleMatch', () => {
    const ruleIds = rules.map((r) => r.id).sort();
    const testedIds = Object.keys(RULE_TEST_CASES).sort();
    expect(testedIds).toEqual(ruleIds);

    const detector = new RegexDetector(rules);
    for (const rule of rules) {
      const found = detector.detect(rule.sampleMatch, {
        enabledRuleIds: new Set([rule.id]),
      });
      expect(
        found.length,
        `Rule "${rule.id}" did not match its own sampleMatch`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('guards every built-in regex against ReDoS catastrophic backtracking', () => {
    const adversarialInputs = [
      'a'.repeat(5000) + '@',
      '0'.repeat(5000) + 'X',
      'DE89' + 'ABCD '.repeat(500) + '!',
      '1234-'.repeat(500) + 'X',
      'API_KEY=' + 'a'.repeat(4000) + ' ',
      'password="' + 'x'.repeat(4000),
      '-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(5000),
      '2001:'.repeat(500) + 'zzzz',
      '+1 ' + '123 '.repeat(500) + 'X',
    ];

    const detector = new RegexDetector(rules);

    for (const rule of rules) {
      const enabled = new Set([rule.id]);
      for (const payload of adversarialInputs) {
        const start = performance.now();
        detector.detect(payload, { enabledRuleIds: enabled });
        const elapsed = performance.now() - start;
        expect(
          elapsed,
          `Rule "${rule.id}" took ${elapsed.toFixed(1)}ms on adversarial input (possible ReDoS)`,
        ).toBeLessThan(50);
      }
    }
  });
});

describe('Per-Rule True Positives & False Positives', () => {
  const rules = loadBuiltInRules();
  const detector = new RegexDetector(rules);

  for (const rule of rules) {
    const spec = RULE_TEST_CASES[rule.id];

    describe(`Rule: ${rule.id} (${rule.placeholderPrefix})`, () => {
      it('has at least 3 true-positive and 3 false-positive cases', () => {
        expect(spec.positives.length).toBeGreaterThanOrEqual(3);
        expect(spec.negatives.length).toBeGreaterThanOrEqual(3);
      });

      it('matches all true-positive cases accurately', () => {
        const enabled = new Set([rule.id]);
        for (const { input, expectedValue } of spec.positives) {
          const matches = detector.detect(input, { enabledRuleIds: enabled });
          const values = matches.map((m) => m.rawValue);
          expect(
            values,
            `Expected "${rule.id}" to capture "${expectedValue}" in "${input}"`,
          ).toContain(expectedValue);
        }
      });

      it('ignores all false-positive cases', () => {
        const enabled = new Set([rule.id]);
        for (const negativeInput of spec.negatives) {
          const matches = detector.detect(negativeInput, {
            enabledRuleIds: enabled,
          });
          expect(
            matches,
            `Expected "${rule.id}" NOT to match "${negativeInput}"`,
          ).toHaveLength(0);
        }
      });
    });
  }
});

describe('Deterministic Validators (Luhn+IIN / IBAN / SSN)', () => {
  it('validates credit cards with IIN prefix + Luhn and rejects non-card Luhn numbers', () => {
    expect(isValidLuhn('4532-0151-1283-0366')).toBe(true); // Visa
    expect(isValidLuhn('5105 1051 0510 5100')).toBe(true); // Mastercard
    expect(isValidLuhn('378282246310005')).toBe(true); // Amex
    expect(isValidLuhn('6011111111111117')).toBe(true); // Discover

    expect(isValidLuhn('1234567890123452')).toBe(false); // Passes raw Luhn, invalid card IIN!
    expect(isValidLuhn('1234567812345678')).toBe(false);
    expect(isValidLuhn('0000 0000 0000 0000')).toBe(false);
    expect(isValidLuhn('45320151128')).toBe(false); // too short
  });

  it('validates IBAN with ISO 13616 length and ISO 7064 Mod-97 (including CH/PT 1-char final groups)', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('GB29 NWBK 6016 1331 9268 19')).toBe(true);
    expect(isValidIban('CH93 0076 2011 6238 5295 7')).toBe(true);
    expect(isValidIban('PT50 0002 0123 1234 5678 9015 4')).toBe(true);

    expect(isValidIban('DE00 3704 0044 0532 0130 00')).toBe(false);
    expect(isValidIban('DE89 3704 0044 0532 0130')).toBe(false);
    expect(isValidIban('ZZ89 3704 0044 0532 0130 00')).toBe(false);
  });

  it('validates US SSN and rejects SSA invalid ranges', () => {
    expect(isValidSsn('123-45-6789')).toBe(true);
    expect(isValidSsn('899-99-9999')).toBe(true);

    expect(isValidSsn('000-45-6789')).toBe(false);
    expect(isValidSsn('666-45-6789')).toBe(false);
    expect(isValidSsn('900-45-6789')).toBe(false);
    expect(isValidSsn('123-00-6789')).toBe(false);
    expect(isValidSsn('123-45-0000')).toBe(false);
  });
});
