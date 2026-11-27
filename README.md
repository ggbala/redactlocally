# RedactLocally

**100% browser-local, offline-first PII redactor, secrets scrubber, document anonymizer, and read-only directory scanner — built for safe AI workflows with deterministic, reversible placeholders.**

<p>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" height="20" /></a>
  <a href="https://github.com/ggbala/redactlocally/actions/workflows/ci.yml"><img src="https://github.com/ggbala/redactlocally/actions/workflows/ci.yml/badge.svg" alt="CI Status" height="20" /></a>
  <a href="#zero-network-verification"><img src="https://img.shields.io/badge/Network-0%20Requests-10B981.svg" alt="Network: 0 Requests" height="20" /></a>
  <a href="https://github.com/ggbala/redactlocally/releases/latest"><img src="https://img.shields.io/badge/Offline-Single%20HTML-0F766E.svg" alt="Offline: Single HTML" height="20" /></a>
</p>

[Live Demo](https://redactlocally.com/) &middot; [Download Standalone Offline HTML](https://github.com/ggbala/redactlocally/releases/latest) &middot; [Report an Issue](https://github.com/ggbala/redactlocally/issues)

<p align="center">
  <img src="./docs/screenshot-text-mode.png" alt="RedactLocally Text Mode showing real-time offline redaction of email, phone, IBAN, IP, AWS key, and OpenAI token into reversible placeholders" width="960" />
</p>

> **Verify Privacy in 5 Seconds:** Open Chrome/Firefox DevTools (`F12`) &rarr; **Network** tab, paste sensitive text or drop an Excel/Word file, and run Sanitize + Restore. You will observe **0 outbound network requests**. This guarantee is enforced in CI by Playwright E2E tests.

---

## Why RedactLocally?

Most online "PII redactors" upload your text to a backend API, and browser extensions often request broad read/write permissions across every tab (frequently blocked by corporate IT). **RedactLocally** runs 100% inside your browser with zero server calls, zero login walls, zero analytics, and zero external CDN fonts or scripts.

### Key Features

#### 1. 100% Local, Offline & Air-Gapped Ready
- **Zero network egress**: Every detection, document parse, placeholder substitution, and restoration happens strictly in browser memory and local `IndexedDB`.
- **Single-HTML offline build**: Run `npm run build:offline` (or download `local-sanitizer-offline.html` from [GitHub Releases](https://github.com/ggbala/redactlocally/releases/latest)) to get one self-contained `.html` file that runs via `file://` on completely disconnected, air-gapped machines.
- **No external runtime assets**: Uses local system sans-serif and monospace font stacks only — no Google Fonts, no remote icons, no telemetry.

#### 2. Text & Code Sanitizer (Ephemeral Memory Mode)
- **Deterministic reversible placeholders**: Identical values map consistently to the same token (`[EMAIL_1]`, `[AWS_KEY_1]`, `[IBAN_1]`), with automatic literal collision avoidance and length-descending single-pass restoration (`[EMAIL_1]` never corrupts `[EMAIL_10]`).
- **29 built-in high-precision rules + custom terms**:
  - **PII**: Emails (RFC-compliant TLD check — ignores `react@19.1.0`), US/EU/Intl phones, US SSNs (SSA range validated), Passport & National IDs.
  - **Financial**: Credit/Debit cards (ISO/IEC 7812 IIN/BIN prefix + Luhn checksum), IBANs (ISO 13616 lengths + ISO 7064 Mod-97, including Swiss/Portuguese 1-char final groups), SWIFT/BIC codes.
  - **Developer Secrets & Tokens**: OpenAI, Anthropic, AWS Access & Secret Keys, GitHub, GitLab, Stripe (`sk_live_` + `whsec_`), Slack tokens & webhooks, Discord webhooks, GCP/Firebase, SendGrid, Hugging Face, npm, JWTs, PEM private key blocks, database & authenticated HTTP/Git URIs, HTTP Basic Auth & `curl -u`, quoted/unquoted passwords & Bearer tokens (preserves code references like `process.env.*` and `os.environ`).
  - **Network**: IPv4 (ignores `v1.2.3.4`), IPv6 (full, compressed & IPv4-mapped; ignores C++/Rust `::add` & `std::vector`), MAC addresses.
  - **Custom Rules Drawer**: Toggle built-in rules or add exact company names, project codenames, and custom regexes on the fly.
- **Overwrite-on-sanitize memory table**: Text Mode mappings stay strictly in RAM (never written to disk) and overwrite on each run. The **Restore AI Reply** drawer stays collapsed by default and expands on demand with exact `[HH:mm:ss]` mapping context.

#### 3. Format-Preserving Document Sanitizer
- **Excel & CSV (`.xlsx`, `.xls`, `.csv`)**: Preserves formulas (`=SUM(...)`), column widths, multiple worksheets, RichText fonts, quoted commas, and UTF-8 characters. Optionally strips author/company workbook metadata (enabled by default).
- **Word (`.docx`)**: Merges split `<w:r><w:t>` XML runs per paragraph so partially bolded or formatted emails/phones are never missed, while preserving tables, headers, footers, and styles. Optionally strips `docProps/core.xml` and `docProps/app.xml` metadata.
- **Plain Text, Code & Configs**: `.txt`, `.md`, `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.json` (validated to remain `JSON.parse`-safe), `.yaml`, `.yml`, `.env`, `.sql`, `.log`, `.xml`, `.go`, `.java`, `.sh`, `.ini`, `.toml`.
- **Local Mapping Vault (`IndexedDB`) + Portable `.json` Key Files**: Document maps auto-save locally bound to the original filename and timestamp, with graceful in-memory fallback on restricted `file://` origins. Export/import portable `.json` key maps (stamped with a confidentiality header and strict import schema validation).
- **3-Part Verification Diff on Restore**: Immediately reports **Replaced** counts (with shoulder-surfing value masking), **Unmatched / Missing from AI File** (flags rows the AI may have dropped), and **Unknown Placeholders** (flags hallucinated or wrong-map placeholders).

#### 4. Read-Only Local Directory Scanner (Scan & Alert Only)
- **Zero-modification folder audit**: Select or drag & drop any local directory to recursively scan code, configs, Excel (`.xlsx`/`.csv`), Word (`.docx`), and text files for leaked API keys, passwords, cards, IBANs, and PII — without modifying any files or writing to storage.
- **Exact location pinpointing**: Reports relative file paths with line numbers (`Line 12` / `Lines 1–3` for multiline PEM blocks), Excel sheet & cell addresses (`Sheet "Q3_Payroll" · A2`), and Word body/header/footer paragraphs (including split XML runs).
- **Noise filtering & privacy-safe export**: Skips `node_modules`, `.git`, `dist`, `build`, unsupported binaries, and oversized files by default; masks all findings until explicitly revealed; supports category/path filtering, scan cancellation, and masked `.json` audit report export.

> **Current Format Scope:** PDF (`.pdf`) files are **not supported yet** and are rejected gracefully with a clear notice (`src/handlers/pdf/` is reserved as a clean extension stub). True irreversible PDF redaction is on the roadmap for an upcoming release.

---

## Technical Architecture

### Tech Stack

| Layer | Technology |
| :--- | :--- |
| **UI & Build** | Vite 6, React 19, TypeScript (strict), Tailwind CSS v4, Lucide Icons |
| **Document Parsers** | `exceljs` (`.xlsx`), `papaparse` (`.csv`), `jszip` + native `DOMParser` (`.docx`) |
| **Local Storage** | Browser RAM (Text Mode) & Native `IndexedDB` with `file://` fallback (Document Mode) |
| **Single-HTML Bundle** | `vite-plugin-singlefile` + custom `scripts/build-offline-html.mjs` (`noindex, nofollow`) |
| **Testing & Security Gate** | Vitest + `jsdom` + `fake-indexeddb` (128 unit/integration tests) & Playwright (E2E) |

### Modular Design & Extensibility

```text
public/                         # Static SEO & crawler files (robots.txt, sitemap.xml, favicon.svg)
config/
├── app.config.ts               # Centralized brand, domain & GitHub URLs
└── rules/                      # Declarative JSON rules — zero core engine changes needed
    ├── pii.rules.json
    ├── financial.rules.json
    ├── secrets.rules.json
    ├── network.rules.json
    └── rule-loader.ts          # Schema validation & ReDoS-checked loading
src/
├── core/                       # Pure engine (zero DOM/UI deps): engine, placeholder, diff, validators/
├── detectors/                  # Pluggable DetectorProvider (regex, custom, local SLM / remote stubs)
├── handlers/                   # Isolated per-format plugins (excel/, word/, text/, code/, pdf/ stub)
├── scanner/                    # Read-only local directory scanner & format segment extractors
├── storage/                    # MappingStore abstraction (memory, IndexedDB, .json keyfile, remote stub)
├── billing/                    # Optional capability / license provider interface (fully open by default)
└── ui/                         # Full-English minimalist React components + SEO sections
scripts/                        # Standalone single-HTML offline builder & fixture generator
tests/                          # Unit, document roundtrip integration, fixtures & Playwright E2E suite
```

#### Adding a New Rule (Zero Code Changes)

Drop a JSON object into `config/rules/*.rules.json` and add positive/negative cases in `tests/unit/rules.test.ts`:

```json
{
  "id": "gitlab_token",
  "category": "secrets",
  "label": "GitLab Personal Access Token",
  "placeholderPrefix": "GITLAB_TOKEN",
  "pattern": "(?<![A-Za-z0-9_-])glpat-[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])",
  "flags": "g",
  "priority": 90,
  "validator": null,
  "enabledByDefault": true,
  "sampleMatch": "glpat-aBcDeFgHiJkLmNoPqRsT12"
}
```

---

## Quick Start & Verification

Requires **Node.js >= 20**.

```bash
# 1. Install dependencies (and Playwright Chromium for E2E security tests)
npm install
npx playwright install chromium

# 2. Start local dev server
npm run dev

# 3. Build online web app & standalone air-gapped single-HTML bundle
#    Outputs: dist/ and dist-offline/local-sanitizer-offline.html
npm run build && npm run build:offline

# 4. Run full automated verification suite (Unit + Document Roundtrip + Zero-Network E2E)
npm run test:all
```

<a id="zero-network-verification"></a>
### What `npm run test:all` Verifies
- **Rule & ReDoS Guard (`tests/unit/rules.test.ts`)**: Validates JSON schema, asserts `< 50ms` execution on adversarial ReDoS inputs, and tests `>= 3` true positives and `>= 3` false positives for all 29 built-in rules plus Luhn+IIN, IBAN Mod-97, and SSN validators.
- **Engine & Scenarios (`tests/unit/engine.test.ts`, `tests/unit/scenarios.test.ts`)**: Verifies `[EMAIL_1]` vs `[EMAIL_10]` collision-free single-pass restoration, overlap priority resolution, code false-positive protection, and diff accuracy.
- **Document Roundtrip & Directory Scan Integration (`tests/integration/handlers.test.ts`, `scanner.test.ts`, `storage.test.ts`)**: Runs real synthetic fixtures (`.xlsx` with `=SUM(...)` formulas & column widths, `.csv`, `.docx` with split XML runs & metadata, `.json`, `.env`, `.sql`, `.log`, `.txt`, and `.pdf` rejection) through full sanitize/restore roundtrips and read-only multi-format directory scans, plus `IndexedDB` & `.json` keyfile tamper tests.
- **Zero-Network & Offline Single-HTML E2E (`tests/e2e/offline-and-security.spec.ts`)**: Playwright intercepts all browser requests across full Text, Document, and Directory Scanner workflows and asserts **`outboundRequests.length === 0`**, then opens `dist-offline/local-sanitizer-offline.html` over `file://` with `context.setOffline(true)` to verify full offline operation and `<meta name="robots" content="noindex, nofollow">`.

---

## Roadmap

- [x] **V1.0** — 100% offline deterministic engine (29 rules + custom terms), Text, Document (`.xlsx`/`.csv`/`.docx`/`.txt`/code), and read-only Directory Scanner modes, IndexedDB vault, `.json` key export/import, 3-part verification diff, standalone single-HTML build, and zero-network E2E test gate.
- [ ] **V2.0** — Optional in-browser local Small Language Model / ONNX NER (`DetectorProvider`) for context-aware person & organization names without leaving the device.
- [ ] **V2.0** — True irreversible PDF redaction (`src/handlers/pdf/`).
- [ ] **V2.x** — Multi-file batch folder processing & optional self-hosted team rule sync.

---

## License

Released under the [MIT License](./LICENSE). Free to audit, self-host, fork, and build upon.
