# st-certify Overhaul — IA Restructure, DocuSign-Grade Certificates, PDF Export, Mobile/PWA

**Date:** 2026-08-20 · **Status:** approved by user (design sections approved in chat)
**Branch:** `feat/overhaul-certify-ux-20-08-2026` (based on `feat/attendance-hardening-20-08-2026`, PR #3)

Research inputs (delivered in-session, summarized where load-bearing): DocuSign/Documenso
UX teardown; Brazil e-signature legal/market landscape; PDF feasibility (empirical —
deterministic + sealed PDFs were actually built and byte-diffed against our template);
full IA/UX audit of the current app.

## 1. Goals

1. Restructure the app's information architecture so the two products — the
   certificate ("DocuSign-like") product and the events/attendance product — are
   clearly separated, each with role-appropriate entry points ("things converse
   better").
2. Upgrade the certificate product to DocuSign-grade: signer onboarding via
   invites, draft-first edition lifecycle, guided signing and claim ceremonies,
   per-action notifications, an edition management surface, and a verification
   ritual Brazilian institutions recognize.
3. Ship sealed PDF export of certificates (visual + cryptographic seal, QR,
   validation code, evidence-log page).
4. Make every surface responsive and native-feeling on iPhone/iPad; installable
   PWA; rebuild the template designer touch-first.
5. Deep quality: unit tests for all new modules, CI on every PR (including
   `next build` — the gate whose absence shipped breakage on 2026-08-20),
   Chrome visual QA at mobile viewports, adversarial review before merge.

## 2. Non-goals (explicitly out of scope)

- PDF upload / arbitrary-document field placement (user decision: PDF is an
  *export*; the PNG-template pipeline stays canonical and its sha256 stays the
  on-chain commitment).
- ICP-Brasil integration (the seal's signer interface is pluggable; buying and
  wiring a PSC cloud A3 certificate is a future, user-driven step).
- WhatsApp Business API (share links only — `wa.me` prefills).
- Native iOS/Android app (PWA + responsive web only).
- Identity-evidence collection at claim (CPF/OTP binding, selfie, geolocation)
  — future trust upgrade, not this wave.
- Attendance-product restructure (light touch only: nav placement, `/me`
  listing, shared design system).
- **On-chain program changes: none.** Drafts, invites, notifications, PDF, and
  IA are all off-chain. No redeploy, no new audit cycle. The claim transaction
  keeps the student as fee payer (user decision 2026-08-20: keep student-pays;
  recorded limitation — mainnet claiming will eventually need an onramp story).

## 3. Decisions log (user-approved 2026-08-20)

| # | Decision | Choice |
|---|---|---|
| D1 | PDF role | Export only; PNG pipeline canonical; on-chain hash stays `sha256(png)` |
| D2 | Trust rails | Verify-first + cryptographic PDF seal with pluggable cert source (self-managed `.p12` now, ICP-Brasil cloud A3 later; **A1 never** — Adobe AATL renders it invalid) |
| D3 | IA scope | Full redo, two front doors, renamed routes with redirects |
| D4 | Mobile | PWA + native-feel responsive web, one codebase |
| D5 | IA shape | Two product areas in one app (portal split rejected) |
| D6 | Email | Resend; WhatsApp via share links only |
| D7 | Claim fees | Keep student-pays; crypto console becomes contextual, not ambient |

## 4. Page map and navigation

### 4.1 Routes

| New route | Old route | Purpose | Auth |
|---|---|---|---|
| `/` | `/` | New landing: three intent cards — Emitir certificados / Verificar documento / Eventos & presença (organizer entry) | none |
| `/certificates` | `/editions` | Public catalog of open editions | none |
| `/certificates/[slug]` | `/editions/[slug]` | Edition page + request form | form gated on Privy |
| `/verify`, `/verify/[id]` | same | Shared verification (upgraded §8) | none |
| `/me` | same | "Meus documentos": certificates **and** attendance NFTs | `requireUser` |
| `/sign` | `/certificator` | Signer inbox + ceremony | `requireCertifier` |
| `/studio` | `/admin` | Issuer dashboard | `requireSysadmin` |
| `/studio/editions/new` | `/admin/editions/new` | Creation wizard (upgraded §6) | sysadmin |
| `/studio/editions/[id]` | — (new) | Edition management page §6.3 | sysadmin |
| `/events`, `/attend/[token]`, `/nft/[assetId]` | same | Attendance product, unchanged routes | as today |
| `/invite/[token]` | — (new) | Signer invite acceptance §6.1 | token + Privy |

Permanent redirects in `next.config.ts` for every renamed route (old deep links,
QRs and bookmarks keep working). API routes under `/api/**` keep their current
paths (no client-contract churn); new APIs are listed in §12.

### 4.2 Navigation rules

- Anonymous: Certificados, Verificar.
- Authenticated: + Meus documentos.
- `isCertifier`: + Assinaturas (`/sign`).
- `role === "sysadmin"`: + Studio.
- Event creators: + Eventos (client-checked as today; the item no longer shows
  to everyone — the audit's "locked door in the nav" problem).
- Footer mirrors nav truthfully and gains "Para organizadores" (→ `/events`).

### 4.3 Naming system (applies to all copy, pt/en/es)

- The signing person is **"Signatário"** everywhere (nav label "Assinaturas");
  "Certificador" is retired from UI copy.
- "Evento" is reserved for the attendance product. Certificate copy says
  "curso/turma" where it previously said "evento"; the admin audit feed is
  renamed "Atividade".
- "NFT" appears only on the attendance side; certificate copy says
  "certificado" / "registro on-chain".
- Copy compliance: the forbidden-claims list (§14) is binding for landing,
  verify, PDF and email copy.

## 5. Notifications (kills the audit's nine dead hand-offs)

### 5.1 Infrastructure

- `apps/web/lib/email/` — Resend SDK behind a thin `sendEmail()` that degrades
  gracefully when `RESEND_API_KEY`/`EMAIL_FROM` are unset (log + skip, same
  pattern as `dbConfigured`). Template functions return `{subject, html, text}`
  and read the i18n dict (`email.*` namespace, pt/en/es); recipient locale =
  stored preference or pt-BR default.
- New table `notification_log` (migration 0005): `id, type, recipient,
  ref_id, sent_at` — idempotency (never double-send for the same event) and
  digest bookkeeping. RLS service-role-only like all platform tables.
- Daily digest: Vercel Cron (`vercel.json`) hitting `/api/cron/digest`
  (guarded by `CRON_SECRET`), which emails each signer a summary of pending
  requests older than the last notice.

### 5.2 Triggers

| Event | Recipient | When sent |
|---|---|---|
| Signer invited | signer | invite created (§6.1) |
| New request(s) pending | each edition signer | first request immediately, then daily digest |
| Certificate fully signed | student | on the last `sign_certificate` sync |
| Request rejected (reason) | student | reject route |
| Certificate revoked (reason) | student | revoke route |
| Claim receipt (verify link + PDF link) | student | claim-submit success |
| Reminder | signer | manual "Lembrar signatários" button (§6.3), rate-limited 1/day |

WhatsApp: `wa.me/?text=` share buttons with localized prefilled messages on the
edition distribution kit, claim success, and verify pages. No API integration.

## 6. Certificate product core

### 6.1 Signer invites (replaces raw base58 entry)

- Wizard step 2 collects `name + email + role` per seat (2–6 seats).
- Saving the draft creates `signer_invites` rows and emails each signer a magic
  link `/invite/[token]`.
- `/invite/[token]`: shows the edition context, asks the signer to log in with
  Privy (email OTP; wallet optional to link), and binds their **wallet
  address** to the seat — from their Privy-linked wallet(s), chosen if several.
  Seat status: `invited → accepted`. Token single-use, 14-day expiry.
- Advanced fallback: the admin can still type a wallet manually per seat
  (collapsed behind "inserir carteira manualmente"), which marks the seat
  accepted immediately.
- Migration 0005 table `signer_invites`: `id, draft_id, name, role, email,
  token (unique), status, wallet, invited_at, accepted_at, reminded_at`.

### 6.2 Draft-first edition lifecycle

- New table `edition_drafts` (migration 0005): `id, meta jsonb (name, slug,
  supply, date, description), layout jsonb, template_sha, created_by,
  created_at, updated_at, chain_address (null until created)`. The existing
  on-chain mirror (`editions`) is untouched — no invariant changes.
- The wizard reads/writes the server draft (sessionStorage stays as a local
  buffer). Draft metadata remains editable until the chain write.
- **The on-chain `create_edition` moves behind an explicit "Criar on-chain"
  button** on the review step, enabled when all seats are `accepted`. The
  review step renders the QA sample as today but never fires a transaction on
  mount. After creation the draft links to `chain_address` and management moves
  to §6.3.

### 6.3 Edition management page — `/studio/editions/[id]`

One page per edition (draft or created): seat/invite status with re-send;
distribution kit (public link, QR to print, WhatsApp share, copy block);
per-certificate pipeline table (requested → signatures m/n → ready → claimed,
with reject/revoke actions moved here from the flat admin table); "Lembrar
signatários" button; pause/open/close controls; supply and dates. `/studio`
itself becomes a thin dashboard: stat cards + edition list linking here +
Atividade feed. Editions created before the overhaul (no draft row) resolve by
address/slug into the same page in management-only mode; 0005 does not
backfill drafts.

### 6.4 Signing ceremony — `/sign`

Keeps the (good) batch table and adds: a consent panel before the first wallet
prompt (DocuSign-disclosure style: what signing attests, that it is on-chain
and irrevocable); per-batch progress as today; a completion state summarizing
what was signed; mobile card layout (§10); decline keeps its reason dialog.

### 6.5 Claim ceremony + `/me`

- `/me` = "Meus documentos", two sections: Certificados (existing cards) and
  Presenças (new — attendance claims for the session wallets via a new
  `GET /api/me/attendance`, cards linking `/nft/[assetId]`).
- `WalletStrip` (address/SOL/airdrop) leaves the page header. The claim flow
  shows a contextual "saldo insuficiente" card with the airdrop button (devnet
  copy) only when the balance check fails (D7).
- Claim is a guided ceremony: consent → assinar (wallet prompt) → emitindo →
  done. The done state is a payoff: certificate reveal, **Baixar PDF**, verify
  link, WhatsApp/LinkedIn share buttons.

## 7. PDF export + seal (`apps/web/lib/pdf/`)

Per the empirical feasibility report:

- **Builder** (`build.ts`): `pdf-lib` 1.17.1. A4 landscape; certificate PNG
  re-rendered at 300 dpi (a `scale` parameter on the existing satori/resvg
  renderer — same layout, higher raster) embedded 1:1; vector QR via
  `drawSvgPath` (`qrcode` SVG mode); footer with `sha256` + validation code +
  verify URL. Deterministic bytes: pinned CreationDate/ModDate (epoch),
  Producer/Creator `st-certify`, trailer `/ID` = artifact sha prefix,
  `useObjectStreams: false`, double-save. ASCII-safe strings via
  `PDFHexString.fromText` for anything with accents/punctuation (the
  `PDFString` >U+00FF truncation gotcha).
- **Evidence-log last page** ("Trilha de auditoria", Clicksign genre): issuer
  identity, holder name, edition, issuance timestamp, artifact sha256, Solana
  tx + explorer URL, asset id, cluster, signer roster with sign times, verify
  URL + validation code.
- **Metadata**: standard Info + custom Info keys + XMP (`certify:` namespace:
  artifactSha256, solanaTx, assetId, cluster, verifyUrl) + attached
  `certify-metadata.json` (pinned dates).
- **Seal** (`seal.ts`): `@signpdf/signpdf` + `placeholder-pdf-lib` behind a
  `CertificateSource` interface (`sign(pdfBuffer, signingTime) → DER CMS`).
  Implementation 1: `P12Signer` from `SEAL_P12_BASE64` + `SEAL_P12_PASSPHRASE`
  env (self-managed org cert; Adobe shows a signature panel, "validity
  unknown" — honest). Implementation 2 (future, out of scope): PSC cloud A3.
  Visible seal widget drawn with pdf-lib at a fixed rect before placeholder
  insertion; `signingTime` pinned to the on-chain issuance time; signature
  placeholder 16 KiB. Sealing is feature-flagged: unset env → export ships
  unsealed (still valid, still verifiable).
- **Route**: `GET /api/certificates/[addr]/pdf` — claimed certificates only;
  builds (or serves from storage cache `metadata` bucket sibling
  `certs-pdf/{artifact_sha}.pdf`, upsert) and streams with
  `Content-Disposition`. Exposed on `/me` claimed cards, `/verify/[id]`, and
  the claim receipt email.
- **On-chain commitment unchanged**: the anchored hash remains `sha256(png)`;
  the PDF carries the hash rather than being the hash.

## 8. Verification upgrade

- **Validation code**: migration 0005 adds `certificates.verify_code` (8-char
  Crockford base32 derived from `sha256(address)`, unique index, backfilled).
  Printed on the PDF footer and shown on `/verify/[id]`; `/verify` accepts it
  as input (exact-match lookup).
- **`?lang=` override** on `/verify/[id]` (and `/nft/[assetId]`): query param
  beats cookie, sets `<html lang>`, and the language switcher on those pages
  updates the URL — a shareable English link exists.
- **De-jargon**: slot/PDA/tx signatures collapse behind a "Detalhes técnicos"
  disclosure; the headline layer speaks issuer/holder/date/status only.
- **Issuer identity block**: name, logo, optional CNPJ + contact (from a new
  `ISSUER_*` env config), because direct issuer confirmation is the fallback
  every real verifier uses.
- **PDF accepted in the dropzone**: extract the embedded XMP/Info hash (and
  fall back to locating the embedded PNG) → same verification path as PNG.
- Print stylesheet for the verdict page.

## 9. Attendance product (light touch)

Nav/entry changes (§4.2); "Presenças" section on `/me`; share polish reusing
the WhatsApp prefills; naming cleanup (§4.3). No structural changes; recent
hardening already modernized this side. Route names unchanged.

## 10. Mobile / PWA / design system

- **PWA**: Next `manifest.ts` (name, icons incl. maskable + apple-touch,
  theme/background colors, `display: standalone`), iOS meta, `viewport-fit=
  cover` + safe-area utilities applied to nav/sticky bars. No service worker
  (installability without it; offline verification is not meaningful).
- **Responsive debt**: the four card-less tables (`EditionsTable`,
  `CertificatesTable`, certificator `EditionGroupTable`, verify `SignerTable`)
  adopt the `EventList` table+cards pattern; `StatusTimeline` goes vertical on
  narrow screens; sticky action bars respect safe areas; `capacity-meter`
  locale hydration bug fixed (explicit locale arg).
- **Designer rebuild** (touch-first, same data model — the 0..1 normalized
  layout schema is untouched, zero migration): `@dnd-kit/core` palette →
  click-to-place with cursor ghost (Pointer Events, not mouse events),
  `react-moveable` drag/resize/snap on the canvas, `react-selecto` marquee
  multi-select, `@scena/react-guides` rulers, layer list as z-order/selection
  widget (`@dnd-kit/sortable`), inspector generated from a per-field-type
  schema, zoom control with handle-size compensation, ≥44 px targets,
  `touch-action: none` on the canvas, `setPointerCapture`, shift-nudge =
  coarser (Figma convention — the reference implementation inverts it; we
  don't). Percent inputs remain as the accessibility alternative (WCAG 2.5.7).
- **i18n**: fix the audited hardcoded strings; add a dict-parity unit test;
  landing/nav copy rewritten for the new IA.

## 11. Data model changes (one migration: `0005_overhaul.sql`)

- `edition_drafts` (§6.2), `signer_invites` (§6.1), `notification_log` (§5.1)
  — all RLS-enabled, zero anon policies (platform posture), service-role only.
- `certificates.verify_code` text unique + backfill (§8).
- Re-runnable style per the 0003/0004 conventions (catalog-checked DO blocks,
  NOTICE degradation).

## 12. New/changed APIs (all under existing `apiRoute` + auth helpers)

- `POST/GET/PATCH /api/studio/drafts[...]` — draft CRUD (sysadmin).
- `POST /api/studio/drafts/[id]/invites` + `POST .../invites/[id]/remind`.
- `GET /api/invite/[token]` + `POST /api/invite/[token]/accept` (Privy session
  required; binds wallet).
- `POST /api/studio/drafts/[id]/create-onchain` — the explicit chain write.
- `GET /api/me/attendance` — session wallets → attendance claims.
- `GET /api/certificates/[addr]/pdf` (§7).
- `GET /api/cron/digest` (`CRON_SECRET`).
- Existing routes gain notification calls (sign-sync, reject, revoke,
  claim-submit). No breaking changes to existing request/response shapes.

## 13. New environment variables

`RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `SEAL_P12_BASE64` (optional),
`SEAL_P12_PASSPHRASE` (optional), `ISSUER_NAME`, `ISSUER_CONTACT_URL`
(optional `ISSUER_CNPJ`). Every one degrades gracefully when unset (email
skips + logs, seal ships unsealed, issuer block hides); documented in
`.env.example` + README env table + `.env.vercel` staging.

## 14. Copy compliance (binding, from the legal research)

Never claim: "assinatura qualificada", "ICP-Brasil" (until a real cert is
used), "presunção de veracidade", "equivale a firma reconhecida", "validade
jurídica plena", "reconhecido/validado pelo MEC", "diploma", "substitui o
cartório"/"fé pública", "impossível de falsificar"/"imutável", "blockchain
garante a autenticidade", any gov.br integration implication. Approved
framings: "assinatura eletrônica com validade jurídica conforme a MP
2.200-2/2001 e a Lei 14.063/2020, para uso entre as partes"; "carimbo de tempo
público e independente"; "trilha de auditoria completa"; "dados pessoais não
são publicados em blockchain — apenas o hash (LGPD)".

## 15. Quality gates

- **Unit**: every new lib module tested (email templates render per locale,
  PDF builder determinism — two-run byte equality, mirroring the M2 gate —
  invite token lifecycle, verify-code derivation, notification idempotency,
  dict parity). Existing 274-test suite stays green.
- **CI** (`.github/workflows/ci.yml`, runs on every PR): pnpm typecheck, lint,
  vitest, **`next build`** (with stub env; the app already degrades when
  Supabase is unconfigured); a paths-filtered Rust job (fmt --check, clippy
  `-D warnings`, cargo test) for `programs/**`/`tests/**`.
- **E2E**: devnet script extended — draft → invites (token accept simulated) →
  create-onchain → request → sign → claim → PDF bytes verified.
- **Visual QA**: Chrome passes at iPhone (393×852), iPad (1024×1366), desktop;
  light + dark; PWA installability check via Lighthouse.
- **Adversarial multi-agent review** of the full diff before merge.
- Migration 0005 applied to production only with explicit user approval, after
  the branch review (same protocol as 0003/0004).

## 16. Delivery waves (each gated on green before the next)

1. **Foundations**: migration 0005; email lib + templates + log + cron; route
   renames/redirects/nav/landing; naming/i18n sweep.
2. **Certificate core**: drafts + invites (+ accept page), wizard rework,
   management page, signing consent + completion, claim ceremony, `/me`
   unification, notification triggers.
3. **Artifacts**: PDF builder + seal + route + caching; verification upgrade
   (code, lang, de-jargon, issuer block, PDF dropzone).
4. **Designer + mobile/PWA**: designer rebuild; table/card debt; PWA manifest
   + safe areas; polish pass.
5. **Hardening**: full gates, visual QA, adversarial review, docs ripple
   (README, CHANGELOG, runbooks, `.env` tables).

Waves run as parallel agent lanes (worktree isolation where edits overlap),
coordinated from this session; incremental commits per wave.

## 17. Deferred / user to-dos (non-blocking)

- Resend domain DNS records (at ship time).
- PSC cloud A3 purchase + confirm unattended server-side signing (before the
  ICP-Brasil seal upgrade).
- Mainnet story for student-paid claim fees (D7 recorded limitation).
- Optional future: identity-evidence at claim (CPF/OTP), in-person/kiosk
  signing mode for ceremony days, `?lang` on every public page.
