import {
  translate,
  type TranslateParams,
  type TranslationKey,
} from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Transactional emails: one accessible layout, seven kinds, copy in
 * lib/i18n/dict/email.ts. Pure and side-effect free — `sendEmail` (send.ts)
 * does the delivering, which is what makes every kind × locale testable.
 */
export const EMAIL_KINDS = [
  "signer-invite",
  "requests-pending",
  "cert-ready",
  "cert-rejected",
  "cert-revoked",
  "claim-receipt",
  "signer-reminder",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

export interface EmailPayloads {
  "signer-invite": {
    signerName: string;
    editionName: string;
    inviteUrl: string;
  };
  "requests-pending": {
    editionName: string;
    count: number;
    signUrl: string;
  };
  "cert-ready": {
    studentName: string;
    editionName: string;
    claimUrl: string;
  };
  "cert-rejected": {
    studentName: string;
    editionName: string;
    reason: string | null;
  };
  "cert-revoked": {
    studentName: string;
    editionName: string;
    reason: string | null;
  };
  "claim-receipt": {
    studentName: string;
    editionName: string;
    verifyUrl: string;
    pdfUrl: string;
  };
  "signer-reminder": {
    editionName: string;
    count: number;
    signUrl: string;
  };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Kind-specific content, in plain text — the layout escapes it for HTML. */
interface EmailBlock {
  subject: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Secondary destination, rendered as a plain link under the CTA button. */
  link?: { label: string; url: string };
}

type Translate = (key: TranslationKey, params?: TranslateParams) => string;

type BlockRenderer<K extends EmailKind> = (
  t: Translate,
  payload: EmailPayloads[K],
) => EmailBlock;

const RENDERERS: { [K in EmailKind]: BlockRenderer<K> } = {
  "signer-invite": (t, p) => ({
    subject: t("email.signerInvite.subject", { editionName: p.editionName }),
    heading: t("email.signerInvite.heading", { signerName: p.signerName }),
    paragraphs: [
      t("email.signerInvite.body", { editionName: p.editionName }),
      t("email.signerInvite.note"),
    ],
    cta: { label: t("email.signerInvite.cta"), url: p.inviteUrl },
  }),

  "requests-pending": (t, p) => ({
    subject:
      p.count === 1
        ? t("email.requestsPending.subjectOne")
        : t("email.requestsPending.subjectMany", { count: p.count }),
    heading: t("email.requestsPending.heading"),
    paragraphs: [
      p.count === 1
        ? t("email.requestsPending.bodyOne", { editionName: p.editionName })
        : t("email.requestsPending.bodyMany", {
            editionName: p.editionName,
            count: p.count,
          }),
      t("email.requestsPending.note"),
    ],
    cta: { label: t("email.requestsPending.cta"), url: p.signUrl },
  }),

  "cert-ready": (t, p) => ({
    subject: t("email.certReady.subject", { editionName: p.editionName }),
    heading: t("email.certReady.heading", { studentName: p.studentName }),
    paragraphs: [
      t("email.certReady.body", { editionName: p.editionName }),
      t("email.certReady.note"),
    ],
    cta: { label: t("email.certReady.cta"), url: p.claimUrl },
  }),

  "cert-rejected": (t, p) => ({
    subject: t("email.certRejected.subject", { editionName: p.editionName }),
    heading: t("email.certRejected.heading", { studentName: p.studentName }),
    paragraphs: [
      t("email.certRejected.body", { editionName: p.editionName }),
      reasonLine(t, p.reason),
      t("email.certRejected.note"),
    ],
  }),

  "cert-revoked": (t, p) => ({
    subject: t("email.certRevoked.subject", { editionName: p.editionName }),
    heading: t("email.certRevoked.heading", { studentName: p.studentName }),
    paragraphs: [
      t("email.certRevoked.body", { editionName: p.editionName }),
      reasonLine(t, p.reason),
      t("email.certRevoked.note"),
    ],
  }),

  "claim-receipt": (t, p) => ({
    subject: t("email.claimReceipt.subject", { editionName: p.editionName }),
    heading: t("email.claimReceipt.heading", { studentName: p.studentName }),
    paragraphs: [
      t("email.claimReceipt.body", { editionName: p.editionName }),
      t("email.claimReceipt.privacy"),
    ],
    cta: { label: t("email.claimReceipt.cta"), url: p.verifyUrl },
    link: { label: t("email.claimReceipt.pdfLabel"), url: p.pdfUrl },
  }),

  "signer-reminder": (t, p) => ({
    subject:
      p.count === 1
        ? t("email.signerReminder.subjectOne")
        : t("email.signerReminder.subjectMany", { count: p.count }),
    heading: t("email.signerReminder.heading"),
    paragraphs: [
      p.count === 1
        ? t("email.signerReminder.bodyOne", { editionName: p.editionName })
        : t("email.signerReminder.bodyMany", {
            editionName: p.editionName,
            count: p.count,
          }),
      t("email.signerReminder.note"),
    ],
    cta: { label: t("email.signerReminder.cta"), url: p.signUrl },
  }),
};

function reasonLine(t: Translate, reason: string | null): string {
  return reason?.trim()
    ? `${t("email.common.reasonLabel")} ${reason.trim()}`
    : t("email.common.noReason");
}

export function renderEmail<K extends EmailKind>(
  kind: K,
  locale: Locale,
  payload: EmailPayloads[K],
): RenderedEmail {
  const t: Translate = (key, params) => translate(locale, key, params);
  const block = RENDERERS[kind](t, payload);
  return {
    subject: block.subject,
    html: renderHtml(locale, block, t),
    text: renderText(block, t),
  };
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

/**
 * The issuer named in the footer. `ISSUER_NAME` is optional (spec §13), so the
 * product name stands in — a footer reading "Enviado por undefined" is the
 * failure mode this guards against.
 */
function issuerName(t: Translate): string {
  return process.env.ISSUER_NAME?.trim() || t("email.layout.brand");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function renderHtml(locale: Locale, block: EmailBlock, t: Translate): string {
  const preheader = block.paragraphs[0] ?? block.subject;
  const cta = block.cta
    ? `
          <tr>
            <td style="padding:8px 0 4px;">
              <a href="${escapeHtml(block.cta.url)}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#111827;color:#ffffff;font-weight:600;font-size:16px;line-height:20px;text-decoration:none;">${escapeHtml(block.cta.label)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 0 0;font-size:13px;line-height:20px;color:#6b7280;">
              ${escapeHtml(t("email.layout.ctaFallback"))}<br />
              <a href="${escapeHtml(block.cta.url)}" style="color:#4b5563;word-break:break-all;">${escapeHtml(block.cta.url)}</a>
            </td>
          </tr>`
    : "";
  const link = block.link
    ? `
          <tr>
            <td style="padding:12px 0 0;font-size:15px;line-height:22px;">
              <a href="${escapeHtml(block.link.url)}" style="color:#1d4ed8;">${escapeHtml(block.link.label)}</a>
            </td>
          </tr>`
    : "";
  const paragraphs = block.paragraphs
    .map(
      (paragraph) => `
          <tr>
            <td style="padding:0 0 14px;font-size:16px;line-height:24px;color:#374151;">${escapeHtml(paragraph)}</td>
          </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${escapeHtml(block.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:32px 28px;">
            <tr>
              <td style="padding:0 0 20px;font-size:15px;font-weight:700;letter-spacing:0.02em;color:#111827;">${escapeHtml(t("email.layout.brand"))}</td>
            </tr>
            <tr>
              <td style="padding:0 0 14px;font-size:22px;line-height:30px;font-weight:700;color:#111827;">
                <h1 style="margin:0;font-size:22px;line-height:30px;font-weight:700;">${escapeHtml(block.heading)}</h1>
              </td>
            </tr>${paragraphs}${cta}${link}
            <tr>
              <td style="padding:24px 0 0;border-top:1px solid #e5e7eb;font-size:13px;line-height:20px;color:#6b7280;">
                ${escapeHtml(t("email.layout.footerIssuer", { issuer: issuerName(t) }))}<br />
                ${escapeHtml(t("email.layout.footerNoReply"))}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(block: EmailBlock, t: Translate): string {
  const lines = [block.heading, "", ...block.paragraphs];
  if (block.cta) {
    lines.push("", `${block.cta.label}: ${block.cta.url}`);
  }
  if (block.link) {
    lines.push("", `${block.link.label}: ${block.link.url}`);
  }
  lines.push(
    "",
    "—",
    t("email.layout.footerIssuer", { issuer: issuerName(t) }),
    t("email.layout.footerNoReply"),
  );
  return `${lines.join("\n")}\n`;
}
