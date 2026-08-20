import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Layout } from "./layout";
import pkg from "../../package.json";

const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

const FONT_FILES = [
  { family: "Inter", weight: 400, file: "Inter-Regular.ttf" },
  { family: "Inter", weight: 600, file: "Inter-SemiBold.ttf" },
  { family: "Great Vibes", weight: 400, file: "GreatVibes-Regular.ttf" },
] as const;

interface FontDigest {
  family: string;
  weight: number;
  file: string;
  sha256: string;
}

let fontDigestsCache: FontDigest[] | null = null;

function computeFontDigests(): FontDigest[] {
  if (fontDigestsCache) {
    return fontDigestsCache;
  }
  fontDigestsCache = FONT_FILES.map(({ family, weight, file }) => ({
    family,
    weight,
    file,
    sha256: createHash("sha256")
      .update(readFileSync(path.join(FONTS_DIR, file)))
      .digest("hex"),
  }));
  return fontDigestsCache;
}

function stripVersionPrefix(version: string): string {
  return version.replace(/^[\^~]/, "");
}

export interface MetadataSigner {
  wallet: string;
  name: string;
  role: string;
  txSig?: string | null;
}

export interface BuildMetadataJsonInput {
  editionName: string;
  certNumber: number;
  maxSupply?: number;
  /** Defaults to a generated pt-BR description referencing editionName. */
  description?: string;
  artifactSha256Hex: string;
  imageUrl: string;
  /** The public verify page URL for this certificate. */
  externalUrl: string;
  templateUrl: string;
  layout: Layout;
  values: {
    /** Plaintext student name — this JSON is the only off-chain place it lives. */
    studentName: string;
    dateText: string;
    certId: string;
  };
  signers: MetadataSigner[];
}

export interface CertifyMetadataJson {
  name: string;
  symbol: "CERT";
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  properties: {
    files: Array<{ uri: string; type: string }>;
    category: "image";
  };
  render_spec: {
    version: 1;
    template: { url: string; sha256: string };
    layout: Layout;
    values: {
      student_name: string;
      date_text: string;
      cert_id: string;
    };
    signers: Array<{
      wallet: string;
      name: string;
      role: string;
      tx_sig: string | null;
    }>;
    fonts: FontDigest[];
    engine: { satori: string; resvg: string };
    canvas: { width: number; height: number };
  };
}

/**
 * Builds the off-chain metadata JSON for a claimed certificate: Metaplex
 * standard fields + a full `render_spec` sufficient to regenerate the exact
 * same PNG from this JSON alone (given the pinned engine versions + committed
 * fonts + template). The `name_salt` is deliberately NOT published: an
 * archived salt+name pair would cryptographically bind the student to the
 * on-chain commitment forever, defeating post-erasure unlinkability (LGPD).
 * Commitment verification is served by /verify, which holds the salt
 * server-side.
 */
export function buildMetadataJson(
  input: BuildMetadataJsonInput,
): CertifyMetadataJson {
  const numbering = input.maxSupply
    ? `#${input.certNumber} of ${input.maxSupply}`
    : `#${input.certNumber}`;

  return {
    name: `${input.editionName} #${input.certNumber}`,
    symbol: "CERT",
    description:
      input.description ??
      `Certificado onchain emitido pela Superteam Brasil para "${input.editionName}", verificável via Superteam Certify.`,
    image: input.imageUrl,
    external_url: input.externalUrl,
    attributes: [
      { trait_type: "Artifact SHA-256", value: input.artifactSha256Hex },
      // Composed string for humans; the raw numbers below let indexers and
      // marketplaces sort/range-filter, which a "#7 of 50" string cannot.
      { trait_type: "Cert Number", value: numbering },
      { trait_type: "Serial", value: input.certNumber },
      ...(input.maxSupply
        ? [{ trait_type: "Edition Size", value: input.maxSupply }]
        : []),
    ],
    properties: {
      files: [{ uri: input.imageUrl, type: "image/png" }],
      category: "image",
    },
    render_spec: {
      version: 1,
      template: {
        url: input.templateUrl,
        sha256: input.layout.template.sha256,
      },
      layout: input.layout,
      values: {
        student_name: input.values.studentName,
        date_text: input.values.dateText,
        cert_id: input.values.certId,
      },
      signers: input.signers.map((signer) => ({
        wallet: signer.wallet,
        name: signer.name,
        role: signer.role,
        tx_sig: signer.txSig ?? null,
      })),
      fonts: computeFontDigests(),
      engine: {
        satori: stripVersionPrefix(pkg.dependencies.satori),
        resvg: stripVersionPrefix(pkg.dependencies["@resvg/resvg-js"]),
      },
      canvas: input.layout.canvas,
    },
  };
}
