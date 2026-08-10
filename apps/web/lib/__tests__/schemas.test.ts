import { describe, it, expect } from "vitest";
import {
  editionWizardSchema,
  editionMetaSchema,
  editionSignerFormSchema,
  requestCertificateSchema,
  studentNameSchema,
} from "../schemas";
import { canonicalizeLayout, specHash, type Layout } from "../render/layout";

const validMeta = {
  name: "Bootcamp Solana 2026",
  slug: "bootcamp-solana-2026",
};

const validSigners = [
  { wallet: "11111111111111111111111111111111", name: "Ana", role: "Head" },
  {
    wallet: "So11111111111111111111111111111111111111",
    name: "Rafael",
    role: "Diretor",
  },
];

const validCustomLayout: Layout = {
  version: 1,
  canvas: { width: 1800, height: 1200 },
  template: { sha256: "a".repeat(64) },
  signers: validSigners,
  fields: {
    student_name: {
      x: 0.1,
      y: 0.4,
      w: 0.8,
      h: 0.1,
      size: 0.06,
      color: "#FFFFFF",
      align: "center",
      font: "inter",
      weight: 600,
    },
    date: {
      x: 0.1,
      y: 0.52,
      w: 0.8,
      h: 0.04,
      size: 0.02,
      color: "#94A3B8",
      align: "center",
      font: "inter",
      weight: 400,
    },
    cert_id: {
      x: 0.1,
      y: 0.92,
      w: 0.8,
      h: 0.03,
      size: 0.014,
      color: "#94A3B8",
      align: "center",
      font: "inter",
      weight: 400,
    },
    qr: { x: 0.86, y: 0.06, size: 0.1 },
  },
  signatures: [
    { x: 0.06, y: 0.78, w: 0.43, h: 0.12, align: "center" },
    { x: 0.51, y: 0.78, w: 0.43, h: 0.12, align: "center" },
  ],
};

describe("editionWizardSchema — templatePath / customLayout (M6)", () => {
  it("accepts the default path without a customLayout (M3 behavior unchanged)", () => {
    const result = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "default",
    });
    expect(result.success).toBe(true);
  });

  it("rejects the custom path when customLayout is missing", () => {
    const result = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "custom",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "customLayout",
      );
      expect(issue).toBeDefined();
    }
  });

  it("accepts the custom path with a valid customLayout", () => {
    const result = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "custom",
      customLayout: validCustomLayout,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a custom path whose customLayout fails M2's own schema (e.g. malformed hash)", () => {
    const result = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "custom",
      customLayout: {
        ...validCustomLayout,
        template: { sha256: "not-a-valid-hash" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("a validated customLayout round-trips stably through canonicalizeLayout/specHash", () => {
    const parsed = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "custom",
      customLayout: validCustomLayout,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const layout = parsed.data.customLayout;
    expect(layout).toBeDefined();
    if (!layout) return;

    const hashA = specHash(layout);
    const hashB = specHash(layout);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalizeLayout(layout)).toBe(canonicalizeLayout(layout));
  });
});

// -----------------------------------------------------------------------------
// M7 hardening: name-sanitization fixtures (plan §Security #2 "name
// impersonation is the top human risk"). studentNameSchema's transform runs
// identically on the client (request form preview) and on the server
// (app/api/certificates/prepare-request/route.ts imports the same schema) —
// these fixtures exercise the one shared implementation, so passing here
// proves both boundaries.
//
// Every invisible/confusable character below is written as an explicit
// \u escape (never pasted as a literal control/homoglyph character) so the
// exact codepoint under test is legible in a diff and in a plain editor,
// rather than silently relying on invisible bytes in the source file.
// -----------------------------------------------------------------------------

// Mirrors lib/schemas.ts's BIDI_CONTROL_CHARS range exactly (U+202A-202E
// embeds/overrides, U+2066-2069 isolates).
const BIDI_CONTROL_CODEPOINTS = [
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
];
// Mirrors ZERO_WIDTH_CHARS exactly (U+200B-200F + the BOM U+FEFF).
const ZERO_WIDTH_CODEPOINTS = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff];
const RLO = String.fromCodePoint(0x202e); // U+202E right-to-left override
const ZWSP = String.fromCodePoint(0x200b); // U+200B zero-width space
const ZWJ = String.fromCodePoint(0x200d); // U+200D zero-width joiner
const CYRILLIC_A = String.fromCodePoint(0x0430); // U+0430, looks like Latin "a"
const GREEK_OMICRON = String.fromCodePoint(0x03bf); // U+03BF, looks like Latin "o"

describe("studentNameSchema — sanitization hardening fixtures (M7)", () => {
  it("accepts an ordinary pt-BR name with accents, unchanged", () => {
    const result = studentNameSchema.safeParse("José da Silva Ação");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("José da Silva Ação");
  });

  it("strips an RTL-override control character (U+202E)", () => {
    const result = studentNameSchema.safeParse(`Jo${RLO}ão Pereira`);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("João Pereira");
      expect(result.data.codePointAt(0)).not.toBe(0x202e);
    }
  });

  it("strips every bidi embedding/override/isolate control character", () => {
    for (const codepoint of BIDI_CONTROL_CODEPOINTS) {
      const ch = String.fromCodePoint(codepoint);
      const result = studentNameSchema.safeParse(`Ana${ch} Souza`);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("Ana Souza");
    }
  });

  it("strips zero-width characters and the BOM", () => {
    for (const codepoint of ZERO_WIDTH_CODEPOINTS) {
      const ch = String.fromCodePoint(codepoint);
      const result = studentNameSchema.safeParse(`Ana${ch} Souza`);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("Ana Souza");
    }
  });

  it("strips bidi + zero-width characters combined, then collapses whitespace", () => {
    const bidi = String.fromCodePoint(0x202b); // LRE
    const bidiClose = String.fromCodePoint(0x202c); // PDF
    const result = studentNameSchema.safeParse(
      `${bidi}Maria${ZWSP}${bidiClose}  Eduarda${ZWSP}`,
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Maria Eduarda");
  });

  it("rejects a name mixing Latin and Cyrillic letters (homoglyph impersonation)", () => {
    // "Vit{CYRILLIC_A}lik" — U+0430, not Latin "a" (U+0061).
    const result = studentNameSchema.safeParse(`Vit${CYRILLIC_A}lik Buterin`);
    expect(result.success).toBe(false);
  });

  it("rejects a name mixing Latin and Greek letters", () => {
    // Greek omicron (U+03BF) substituted for a Latin "o".
    const result = studentNameSchema.safeParse(`J${GREEK_OMICRON}o Silva`);
    expect(result.success).toBe(false);
  });

  it("accepts a name written entirely in one non-Latin script (mixing, not the script itself, is what's flagged)", () => {
    const result = studentNameSchema.safeParse("Владимир Иванов");
    expect(result.success).toBe(true);
  });

  it("rejects a name over 64 characters after sanitization", () => {
    const result = studentNameSchema.safeParse("A".repeat(65));
    expect(result.success).toBe(false);
  });

  it("accepts a name at exactly the 64-character boundary", () => {
    const result = studentNameSchema.safeParse("A".repeat(64));
    expect(result.success).toBe(true);
  });

  it("rejects a name shorter than 2 characters after sanitization", () => {
    const result = studentNameSchema.safeParse(` A ${ZWSP}`);
    expect(result.success).toBe(false);
  });

  it("rejects a name containing emoji", () => {
    const result = studentNameSchema.safeParse("Ana Beatriz \u{1F600}");
    expect(result.success).toBe(false);
  });

  it("rejects a ZWJ emoji sequence (the zero-width strip removes the joiner, not the emoji codepoints)", () => {
    const result = studentNameSchema.safeParse(
      `Carla \u{1F469}${ZWJ}\u{1F4BB}`,
    );
    expect(result.success).toBe(false);
  });

  it("rejects symbols outside the allowed charset (letters/marks/numbers/space/'/-/.)", () => {
    expect(studentNameSchema.safeParse("Ana <script> Souza").success).toBe(
      false,
    );
    expect(studentNameSchema.safeParse("Ana_Souza").success).toBe(false);
    expect(studentNameSchema.safeParse("Ana@Souza").success).toBe(false);
  });

  it("allows digits (\\p{N} is part of the charset by design, e.g. ordinal suffixes)", () => {
    const result = studentNameSchema.safeParse("Ana 2 Souza");
    expect(result.success).toBe(true);
  });

  it("collapses internal whitespace runs and trims the ends", () => {
    const result = studentNameSchema.safeParse("  Bruno   Costa  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Bruno Costa");
  });
});

describe("requestCertificateSchema — server prepare-request boundary (M7)", () => {
  const editionAddress = "11111111111111111111111111111111";

  it("sanitizes the same RTL-override attack through the full server-facing schema", () => {
    const result = requestCertificateSchema.safeParse({
      editionAddress,
      name: `Jo${RLO}ão Pereira`,
      consent: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("João Pereira");
  });

  it("rejects a homoglyph name through the full server-facing schema", () => {
    const result = requestCertificateSchema.safeParse({
      editionAddress,
      name: `Vit${CYRILLIC_A}lik Buterin`,
      consent: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects without consent even with an otherwise-clean name", () => {
    const result = requestCertificateSchema.safeParse({
      editionAddress,
      name: "Ana Souza",
      consent: false,
    });
    expect(result.success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// M7 hardening: maxUtf8Bytes regression. zod 4.4.3's `.refine()` treats ANY
// truthy return as "valid" — a `.refine(fn)` where `fn` returns `boolean |
// string` (the previous shape here: `utf8ByteLength(value) <= max ||
// message`) never actually rejects, because the fallback error-message
// string is itself truthy. Found while writing these hardening fixtures;
// fixed in lib/schemas.ts by making the predicate a plain boolean and passing
// the message as `.refine()`'s own second argument. These pin the fix.
// -----------------------------------------------------------------------------

describe("editionMetaSchema / editionSignerFormSchema — UTF-8 byte-length caps (M7 regression)", () => {
  it("rejects an edition name over 64 UTF-8 bytes", () => {
    const result = editionMetaSchema.safeParse({
      name: "A".repeat(65),
      slug: "turma-2026",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an edition name at exactly 64 bytes", () => {
    const result = editionMetaSchema.safeParse({
      name: "A".repeat(64),
      slug: "turma-2026",
    });
    expect(result.success).toBe(true);
  });

  it("counts multi-byte UTF-8 characters as their real byte length, not JS char length", () => {
    // Each "á" is 2 UTF-8 bytes; 40 of them is 80 bytes, over the 64-byte cap,
    // even though .length (JS UTF-16 code units) reports only 40.
    const name = "á".repeat(40);
    expect(name.length).toBe(40);
    const result = editionMetaSchema.safeParse({ name, slug: "turma-2026" });
    expect(result.success).toBe(false);
  });

  it("rejects a signer name over 32 UTF-8 bytes", () => {
    const result = editionSignerFormSchema.safeParse({
      wallet: "11111111111111111111111111111111",
      name: "A".repeat(33),
      role: "Diretor",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a signer role over 24 UTF-8 bytes", () => {
    const result = editionSignerFormSchema.safeParse({
      wallet: "11111111111111111111111111111111",
      name: "Ana",
      role: "A".repeat(25),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a signer name/role within both caps", () => {
    const result = editionSignerFormSchema.safeParse({
      wallet: "11111111111111111111111111111111",
      name: "Ana Clara",
      role: "Head de Educação",
    });
    expect(result.success).toBe(true);
  });
});
