/**
 * Representative data for UI-mock mode (`NEXT_PUBLIC_UI_MOCK=1`).
 *
 * Everything here is deterministic — hardcoded ISO timestamps, no `Date.now()`
 * and no randomness — so two reviewers looking at the same screen see the same
 * pixels, and a screenshot stays comparable across days. Content is pt-BR
 * because the product is.
 *
 * Deliberately data-only (no `server-only`, no I/O): `lib/db/certificator-queries.ts`
 * is reachable from client components, so anything it imports must survive the
 * browser bundle. Type imports from `lib/db/**` are erased, so the cycle they
 * form with the query modules that consume these fixtures is compile-time only.
 */

import type {
  AttendanceClaimForOwner,
  AttendanceClaimListRow,
  AttendanceClaimPublicView,
} from "@/lib/db/attendance-queries";
import type { PendingEditionGroup } from "@/lib/db/certificator-queries";
import type { VerifyCertView } from "@/lib/db/claim-verify-queries";
import type { SignerInviteWithDraft } from "@/lib/db/draft-queries";
import type {
  AdminStats,
  AttendanceClaimRow,
  AttendanceEventRow,
  CertificateAdminRow,
  CertificateForOwner,
  CertificateRow,
  EditionDraftRow,
  EditionSignerSummary,
  EditionWithSigners,
  EventRow,
  SignerInviteRow,
} from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

export const MOCK_DID = "did:privy:cmock000demo000preview000user0";
export const MOCK_EMAIL = "maria.silva@exemplo.com.br";

export const MOCK_WALLET_STUDENT =
  "2hVnJqZ8xTwR4mCbPk6YsFgD9LaEuN3rXvQtM5cKzB7W";
export const MOCK_WALLET_SIGNER =
  "7xKXtg2CW3hMPu9qFmT4bYnVLd5RszAeJc8vHkQwNp1r";
export const MOCK_WALLET_CREATOR =
  "8FqWzR2mNvKtY5cXbJ7hSgD4LaPuE9nT3rMxQ6kZwCyV";

const WALLET_SIGNER_2 = "3nFqBw8vZmK5tYcRj2LdSaHgP7uXeN4WrQ9bTxMzVkJ6";
const WALLET_SIGNER_3 = "9dLpXn3WqTz7BvKmR5cYhJ2fSgU8aEwN6xQtVjZr4MyD";
const WALLET_STUDENT_2 = "5RtYuVbNmK8wQzXcE3jHgF7dSaP2LkJ9nBvCxZqM4rTe";
const WALLET_STUDENT_3 = "4KmQzWtR9pYnB6cXjL3hVgS8uPaD2dFtN7rMxK5wZeTv";

/**
 * Deep-link escape hatch: any id/slug/token beginning with `mock-` resolves to
 * a representative fixture, so a screenshot pass can visit a detail screen
 * without knowing the fixture ids — `scripts/ui-qa.mjs` navigates to
 * `/verify/mock-cert`, `/attend/mock-token` and `/studio/editions/mock-1`.
 * Everything else still has to match exactly, which is what keeps the 404 and
 * dead-link states reachable.
 */
const MOCK_ALIAS_PREFIX = "mock-";

function isAlias(id: string): boolean {
  return id.startsWith(MOCK_ALIAS_PREFIX);
}

// ---------------------------------------------------------------------------
// Addresses, signatures, hashes
// ---------------------------------------------------------------------------

const EDITION_1 = "EdaVvR7kN2mQxYtB9cJfL4gHsP6uZwX3nDrTk8bMqW5y";
const EDITION_2 = "Ed2pXmT9rKwQvB6cYnJ4hLgS8uZaF3dNtR7kMxW5qVyb";
const EDITION_3 = "Ed7yTqMwX4nBvK9cRjL2hSgP5uZaE8dFtN3rXkQ6mWzC";
const EDITION_4 = "Ed4mKzWqR8tYnB3cXjL7hVgS2uPaD6dFtN9rMkQ5wZeT";

const CERT_REQUESTED = "Ce1rTkQ8mWzXnB5cYjL3hVgS7uPaD2dFtN9rMxK6wZqE";
const CERT_FULLY_SIGNED = "Ce2wMxK9rTqZnB4cYjL8hVgS3uPaD5dFtN7rXkQ6mWzP";
const CERT_CLAIMED = "Ce3qZnB6cYjL5hVgS9uPaD4dFtN2rXkQ7mWzTxK8rMvJ";
const CERT_REJECTED = "Ce4hVgS2uPaD7dFtN5rXkQ9mWzTxK3rMvJqZnB8cYjL6";
const CERT_REVOKED = "Ce5dFtN3rXkQ8mWzTxK6rMvJqZnB2cYjL9hVgS4uPaD7";
const CERT_PENDING_A = "Ce6mWzTxK4rMvJqZnB7cYjL2hVgS9uPaD3dFtN8rXkQ5";
const CERT_PENDING_B = "Ce7rXkQ2mWzTxK9rMvJqZnB5cYjL6hVgS4uPaD8dFtN3";
const CERT_PENDING_C = "Ce8uPaD6dFtN4rXkQ3mWzTxK7rMvJqZnB9cYjL5hVgS2";

const ASSET_CERT = "As1kQ7mWzTxK4rMvJqZnB9cYjL2hVgS6uPaD8dFtN5rX";
const ASSET_ATTENDANCE_1 = "As2rMvJqZnB3cYjL7hVgS5uPaD9dFtN4rXkQ6mWzTxK8";
const ASSET_ATTENDANCE_2 = "As3cYjL4hVgS8uPaD2dFtN6rXkQ5mWzTxK9rMvJqZnB7";

const COLLECTION_1 = "Co1hVgS7uPaD3dFtN9rXkQ2mWzTxK6rMvJqZnB4cYjL5";
const COLLECTION_2 = "Co2dFtN5rXkQ7mWzTxK2rMvJqZnB6cYjL9hVgS3uPaD8";
const COLLECTION_3 = "Co3rXkQ9mWzTxK5rMvJqZnB8cYjL4hVgS2uPaD7dFtN6";
const COLLECTION_4 = "Co4mWzTxK3rMvJqZnB7cYjL5hVgS9uPaD6dFtN2rXkQ8";

// Transaction signatures are 88 base58 characters; built from two 44-char
// halves so each stays a plausible length wherever the UI prints or links one.
const SIG_HEAD = "5xK7mWzTxQrMvJqZnB9cYjL2hVgS6uPaD8dFtN5rXkQ4";
const SIG_1 = `${SIG_HEAD}3nBvK9cRjL2hSgP5uZaE8dFtN3rXkQ6mWzCyTqMwXbHu`;
const SIG_2 = `${SIG_HEAD}7dSaP2LkJ9nBvCxZqM4rTeYuVbNmK8wQzXcE3jHgF5Ri`;
const SIG_3 = `${SIG_HEAD}9LaEuN3rXvQtM5cKzB7WhVnJqZ8xTwR4mCbPk6YsFgDp`;
const SIG_4 = `${SIG_HEAD}4LaPuE9nT3rMxQ6kZwCyVFqWzR2mNvKtY5cXbJ7hSgDm`;
const SIG_5 = `${SIG_HEAD}6uZwX3nDrTk8bMqW5yEdaVvR7kN2mQxYtB9cJfL4gHsP`;

const SHA_CLAIMED =
  "9f2c4a1d8b73e05fa6c19d4e7b28035cf14a9d6e3b7025c8fa419d63e7b28540";
const SHA_FULLY_SIGNED =
  "31a7f0c95d6b284e13c7ab9052e6d418f3b70a2c95d6e814b37ca029f6d5b184";

// ---------------------------------------------------------------------------
// Editions
// ---------------------------------------------------------------------------

const SIGNERS_BOOTCAMP: EditionSignerSummary[] = [
  {
    position: 0,
    wallet: MOCK_WALLET_SIGNER,
    name: "Ana Beatriz Carvalho",
    role: "Coordenadora Acadêmica",
  },
  {
    position: 1,
    wallet: WALLET_SIGNER_2,
    name: "Rafael Nogueira Lima",
    role: "Diretor de Educação",
  },
  {
    position: 2,
    wallet: WALLET_SIGNER_3,
    name: "Mariana Alves Pinto",
    role: "Instrutora Líder",
  },
];

const SIGNERS_IMERSAO: EditionSignerSummary[] = [
  {
    position: 0,
    wallet: MOCK_WALLET_SIGNER,
    name: "Ana Beatriz Carvalho",
    role: "Coordenadora Acadêmica",
  },
  {
    position: 1,
    wallet: WALLET_SIGNER_3,
    name: "Mariana Alves Pinto",
    role: "Instrutora Líder",
  },
];

const SIGNERS_HACKER_HOUSE: EditionSignerSummary[] = [
  {
    position: 0,
    wallet: WALLET_SIGNER_2,
    name: "Rafael Nogueira Lima",
    role: "Diretor de Educação",
  },
  {
    position: 1,
    wallet: MOCK_WALLET_CREATOR,
    name: "Lucas Ferreira Braga",
    role: "Organizador",
  },
];

const SIGNERS_EAD: EditionSignerSummary[] = [
  {
    position: 0,
    wallet: WALLET_SIGNER_2,
    name: "João Pedro Vasconcelos",
    role: "Reitor",
  },
];

const EDITIONS: EditionWithSigners[] = [
  {
    address: EDITION_1,
    slug: "solana-bootcamp-2026-1",
    name: "Solana Bootcamp Brasil — Turma 2026.1",
    description:
      "Doze semanas de desenvolvimento on-chain: Rust, Pinocchio, Anchor e integração com carteiras. Emitido após a entrega do projeto final.",
    templateSha256: SHA_CLAIMED,
    layout: null,
    specHash: SHA_FULLY_SIGNED,
    status: "Open",
    maxSupply: 120,
    minted: 84,
    requested: 12,
    closed: 3,
    completionDate: "2026-07-31",
    createdAt: "2026-02-10T13:20:00.000Z",
    signers: SIGNERS_BOOTCAMP,
  },
  {
    address: EDITION_2,
    slug: "imersao-rust-anchor-sp",
    name: "Imersão Rust & Anchor — São Paulo",
    description:
      "Imersão presencial de quatro dias na Vila Olímpia, com laboratório de auditoria de programas e deploy assistido em devnet.",
    templateSha256: SHA_FULLY_SIGNED,
    layout: null,
    specHash: SHA_CLAIMED,
    status: "Open",
    maxSupply: 60,
    minted: 41,
    requested: 5,
    closed: 1,
    completionDate: "2026-06-14",
    createdAt: "2026-04-02T10:05:00.000Z",
    signers: SIGNERS_IMERSAO,
  },
  {
    address: EDITION_3,
    slug: "hacker-house-rio",
    name: "Superteam Brasil — Hacker House Rio",
    description:
      "Duas semanas de residência para times selecionados. Certificado de participação sem limite de emissões.",
    templateSha256: null,
    layout: null,
    specHash: null,
    // Uncapped editions store max_supply as 0; the studio renders that as
    // "sem limite" — worth having a fixture that exercises the branch.
    status: "Paused",
    maxSupply: 0,
    minted: 210,
    requested: 0,
    closed: 4,
    completionDate: "2026-05-20",
    createdAt: "2026-01-18T16:45:00.000Z",
    signers: SIGNERS_HACKER_HOUSE,
  },
  {
    address: EDITION_4,
    slug: "fundamentos-web3-ead",
    name: "Fundamentos de Web3 — EAD",
    description:
      "Trilha introdutória a distância, com avaliação final on-line. Turma encerrada.",
    templateSha256: SHA_CLAIMED,
    layout: null,
    specHash: SHA_FULLY_SIGNED,
    status: "Closed",
    maxSupply: 500,
    minted: 487,
    requested: 0,
    closed: 13,
    completionDate: "2025-12-05",
    createdAt: "2025-08-22T09:00:00.000Z",
    signers: SIGNERS_EAD,
  },
];

export function mockEditionsAdmin(): EditionWithSigners[] {
  return EDITIONS;
}

export function mockOpenEditions(): EditionWithSigners[] {
  return EDITIONS.filter((edition) => edition.status === "Open");
}

export function mockEditionBySlug(slug: string): EditionWithSigners | null {
  const match = EDITIONS.find((edition) => edition.slug === slug);
  return match ?? (isAlias(slug) ? EDITIONS[0] : null);
}

export function mockEditionByAddress(
  address: string,
): EditionWithSigners | null {
  const match = EDITIONS.find((edition) => edition.address === address);
  return match ?? (isAlias(address) ? EDITIONS[0] : null);
}

export function mockSlugAvailable(slug: string): boolean {
  return !EDITIONS.some((edition) => edition.slug === slug);
}

/**
 * Whether any of `wallets` signs `editionAddress` — or any edition at all when
 * no address is given. Backs both the "is this visitor a certifier" role check
 * and the per-edition authorization gate, so a preview enforces the same
 * boundary the real thing does rather than waving every action through.
 */
export function mockIsEditionSigner(
  wallets: readonly string[],
  editionAddress?: string,
): boolean {
  return EDITIONS.filter(
    (edition) => !editionAddress || edition.address === editionAddress,
  ).some((edition) =>
    edition.signers.some((signer) => wallets.includes(signer.wallet)),
  );
}

// ---------------------------------------------------------------------------
// Certificates — one fixture per status the UI can render
// ---------------------------------------------------------------------------

const CERTIFICATES: CertificateForOwner[] = [
  {
    address: CERT_REQUESTED,
    editionAddress: EDITION_1,
    editionName: EDITIONS[0].name,
    editionSlug: EDITIONS[0].slug,
    editionSigners: SIGNERS_BOOTCAMP,
    status: "Requested",
    // 1 of 3 signatures collected.
    signerBitmap: 0b001,
    studentName: "Maria Silva Rodrigues",
    imageUrl: null,
    metadataUrl: null,
    asset: null,
    certNumber: null,
    rejectReason: null,
    revokeReason: null,
    createdAt: "2026-08-14T11:30:00.000Z",
    completedAt: null,
  },
  {
    address: CERT_FULLY_SIGNED,
    editionAddress: EDITION_2,
    editionName: EDITIONS[1].name,
    editionSlug: EDITIONS[1].slug,
    editionSigners: SIGNERS_IMERSAO,
    status: "FullySigned",
    signerBitmap: 0b11,
    studentName: "Maria Silva Rodrigues",
    imageUrl:
      "https://placehold.co/1600x1131/1e293b/f8fafc.png?text=Imers%C3%A3o+Rust+%26+Anchor",
    metadataUrl: "https://exemplo.com.br/metadata/imersao-rust-anchor.json",
    asset: null,
    certNumber: 42,
    rejectReason: null,
    revokeReason: null,
    createdAt: "2026-06-18T09:12:00.000Z",
    completedAt: "2026-06-22T14:40:00.000Z",
  },
  {
    address: CERT_CLAIMED,
    editionAddress: EDITION_1,
    editionName: EDITIONS[0].name,
    editionSlug: EDITIONS[0].slug,
    editionSigners: SIGNERS_BOOTCAMP,
    status: "Claimed",
    signerBitmap: 0b111,
    studentName: "Maria Silva Rodrigues",
    imageUrl:
      "https://placehold.co/1600x1131/0f172a/f8fafc.png?text=Solana+Bootcamp+Brasil",
    metadataUrl: "https://exemplo.com.br/metadata/solana-bootcamp-0017.json",
    asset: ASSET_CERT,
    certNumber: 17,
    rejectReason: null,
    revokeReason: null,
    createdAt: "2026-03-05T08:00:00.000Z",
    completedAt: "2026-03-11T19:05:00.000Z",
  },
  {
    address: CERT_REJECTED,
    editionAddress: EDITION_2,
    editionName: EDITIONS[1].name,
    editionSlug: EDITIONS[1].slug,
    editionSigners: SIGNERS_IMERSAO,
    status: "Rejected",
    signerBitmap: 0b01,
    studentName: "Maria S. Rodrigues",
    imageUrl: null,
    metadataUrl: null,
    asset: null,
    certNumber: null,
    rejectReason:
      "O nome informado não confere com o comprovante de matrícula. Reenvie a solicitação com o nome completo.",
    revokeReason: null,
    createdAt: "2026-05-02T15:25:00.000Z",
    completedAt: null,
  },
  {
    address: CERT_REVOKED,
    editionAddress: EDITION_4,
    editionName: EDITIONS[3].name,
    editionSlug: EDITIONS[3].slug,
    editionSigners: SIGNERS_EAD,
    status: "Revoked",
    signerBitmap: 0b1,
    studentName: "Maria Silva Rodrigues",
    imageUrl:
      "https://placehold.co/1600x1131/450a0a/fecaca.png?text=Fundamentos+de+Web3",
    metadataUrl: "https://exemplo.com.br/metadata/fundamentos-web3-0231.json",
    asset: null,
    certNumber: 231,
    rejectReason: null,
    revokeReason:
      "Certificado emitido em duplicidade. A emissão válida é a de número 118.",
    createdAt: "2025-11-28T12:00:00.000Z",
    completedAt: "2025-12-09T17:30:00.000Z",
  },
];

export function mockCertificatesForOwner(): CertificateForOwner[] {
  return CERTIFICATES;
}

const ADMIN_CERTIFICATES: CertificateAdminRow[] = [
  ...CERTIFICATES.map((cert) => ({
    address: cert.address,
    editionAddress: cert.editionAddress,
    editionName: cert.editionName,
    ownerWallet: MOCK_WALLET_STUDENT,
    studentName: cert.studentName,
    status: cert.status,
    signerBitmap: cert.signerBitmap,
    certNumber: cert.certNumber,
    createdAt: cert.createdAt,
  })),
  {
    address: CERT_PENDING_A,
    editionAddress: EDITION_1,
    editionName: EDITIONS[0].name,
    ownerWallet: WALLET_STUDENT_2,
    studentName: "Carlos Eduardo Menezes",
    status: "Requested",
    signerBitmap: 0b001,
    certNumber: null,
    createdAt: "2026-08-17T10:15:00.000Z",
  },
  {
    address: CERT_PENDING_B,
    editionAddress: EDITION_1,
    editionName: EDITIONS[0].name,
    ownerWallet: WALLET_STUDENT_3,
    studentName: "Juliana Prado Meireles",
    status: "Requested",
    signerBitmap: 0b000,
    certNumber: null,
    createdAt: "2026-08-18T14:02:00.000Z",
  },
  {
    address: CERT_PENDING_C,
    editionAddress: EDITION_2,
    editionName: EDITIONS[1].name,
    ownerWallet: WALLET_STUDENT_2,
    studentName: "Carlos Eduardo Menezes",
    status: "Requested",
    signerBitmap: 0b00,
    certNumber: null,
    createdAt: "2026-08-19T08:47:00.000Z",
  },
];

export function mockCertificatesAdmin(filters: {
  edition?: string;
  status?: string;
}): CertificateAdminRow[] {
  return ADMIN_CERTIFICATES.filter(
    (row) =>
      (!filters.edition || row.editionAddress === filters.edition) &&
      (!filters.status || row.status === filters.status),
  );
}

/** The full mirror row (salt included) the claim flow reads. */
export function mockCertificateRow(address: string): CertificateRow | null {
  const cert =
    CERTIFICATES.find((c) => c.address === address) ??
    (isAlias(address) ? CERTIFICATES[2] : undefined);
  if (!cert) return null;
  return {
    address: cert.address,
    edition_address: cert.editionAddress,
    owner_wallet: MOCK_WALLET_STUDENT,
    owner_did: MOCK_DID,
    student_name: cert.studentName,
    name_salt: "bW9jay1zYWx0LWRvLXByZXZpZXctZGUtaW50ZXJmYWNl",
    status: cert.status,
    signer_bitmap: cert.signerBitmap,
    sha256: cert.status === "Requested" ? null : SHA_CLAIMED,
    image_url: cert.imageUrl,
    metadata_url: cert.metadataUrl,
    asset: cert.asset,
    cert_number: cert.certNumber,
    signer_txs: [
      {
        position: 0,
        wallet: MOCK_WALLET_SIGNER,
        tx: SIG_1,
        signedAt: "2026-03-08T10:00:00.000Z",
      },
    ],
    request_tx: SIG_2,
    claim_tx: cert.status === "Claimed" ? SIG_3 : null,
    revoke_tx: cert.status === "Revoked" ? SIG_4 : null,
    revoke_reason: cert.revokeReason,
    reject_reason: cert.rejectReason,
    completed_at: cert.completedAt,
    created_at: cert.createdAt,
    updated_at: cert.completedAt ?? cert.createdAt,
  };
}

export function mockAdminStats(): AdminStats {
  return {
    editionsCount: EDITIONS.length,
    pendingSignaturesCount: 4,
    claimedCount: 822,
    revokedCount: 3,
  };
}

const ADMIN_EVENTS: EventRow[] = [
  {
    id: 7,
    type: "certificate_claimed",
    actor: MOCK_WALLET_STUDENT,
    cert_address: CERT_CLAIMED,
    edition_address: EDITION_1,
    tx_sig: SIG_3,
    payload: { certNumber: 17 },
    created_at: "2026-08-19T18:22:00.000Z",
  },
  {
    id: 6,
    type: "certificate_signed",
    actor: MOCK_WALLET_SIGNER,
    cert_address: CERT_FULLY_SIGNED,
    edition_address: EDITION_2,
    tx_sig: SIG_1,
    payload: { position: 1 },
    created_at: "2026-08-19T16:40:00.000Z",
  },
  {
    id: 5,
    type: "certificate_requested",
    actor: WALLET_STUDENT_3,
    cert_address: CERT_PENDING_B,
    edition_address: EDITION_1,
    tx_sig: SIG_2,
    payload: { studentName: "Juliana Prado Meireles" },
    created_at: "2026-08-18T14:02:00.000Z",
  },
  {
    id: 4,
    type: "certificate_rejected",
    actor: WALLET_SIGNER_3,
    cert_address: CERT_REJECTED,
    edition_address: EDITION_2,
    tx_sig: SIG_5,
    payload: { reason: "Nome divergente" },
    created_at: "2026-08-17T09:31:00.000Z",
  },
  {
    id: 3,
    type: "edition_status_changed",
    actor: MOCK_WALLET_SIGNER,
    cert_address: null,
    edition_address: EDITION_3,
    tx_sig: SIG_4,
    payload: { from: "Open", to: "Paused" },
    created_at: "2026-08-15T13:10:00.000Z",
  },
  {
    id: 2,
    type: "certificate_revoked",
    actor: WALLET_SIGNER_2,
    cert_address: CERT_REVOKED,
    edition_address: EDITION_4,
    tx_sig: SIG_4,
    payload: { reason: "Emissão duplicada" },
    created_at: "2026-08-12T20:05:00.000Z",
  },
  {
    id: 1,
    type: "edition_created",
    actor: MOCK_WALLET_SIGNER,
    cert_address: null,
    edition_address: EDITION_2,
    tx_sig: SIG_2,
    payload: { name: "Imersão Rust & Anchor — São Paulo" },
    created_at: "2026-08-10T11:00:00.000Z",
  },
];

export function mockAdminEvents(limit: number): EventRow[] {
  return ADMIN_EVENTS.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

const VERIFY_VIEWS: VerifyCertView[] = [
  {
    address: CERT_CLAIMED,
    editionAddress: EDITION_1,
    editionName: EDITIONS[0].name,
    editionSlug: EDITIONS[0].slug,
    studentName: "Maria Silva Rodrigues",
    status: "Claimed",
    signerBitmap: 0b111,
    certNumber: 17,
    maxSupply: 120,
    imageUrl:
      "https://placehold.co/1600x1131/0f172a/f8fafc.png?text=Solana+Bootcamp+Brasil",
    metadataUrl: "https://exemplo.com.br/metadata/solana-bootcamp-0017.json",
    sha256: SHA_CLAIMED,
    asset: ASSET_CERT,
    revokeReason: null,
    completionDate: "2026-07-31",
    completedAt: "2026-03-11T19:05:00.000Z",
    createdAt: "2026-03-05T08:00:00.000Z",
    verifyCode: "K7M2QP94",
    signers: SIGNERS_BOOTCAMP.map((signer, index) => ({
      position: signer.position,
      name: signer.name,
      role: signer.role,
      wallet: signer.wallet,
      signed: true,
      txSig: [SIG_1, SIG_2, SIG_3][index],
      signedAt: [
        "2026-03-06T10:12:00.000Z",
        "2026-03-07T14:33:00.000Z",
        "2026-03-08T09:41:00.000Z",
      ][index],
    })),
  },
  {
    address: CERT_REVOKED,
    editionAddress: EDITION_4,
    editionName: EDITIONS[3].name,
    editionSlug: EDITIONS[3].slug,
    studentName: "Maria Silva Rodrigues",
    status: "Revoked",
    signerBitmap: 0b1,
    certNumber: 231,
    maxSupply: 500,
    imageUrl:
      "https://placehold.co/1600x1131/450a0a/fecaca.png?text=Fundamentos+de+Web3",
    metadataUrl: "https://exemplo.com.br/metadata/fundamentos-web3-0231.json",
    sha256: SHA_FULLY_SIGNED,
    asset: null,
    revokeReason:
      "Certificado emitido em duplicidade. A emissão válida é a de número 118.",
    completionDate: "2025-12-05",
    completedAt: "2025-12-09T17:30:00.000Z",
    createdAt: "2025-11-28T12:00:00.000Z",
    verifyCode: "R4X8TB25",
    signers: SIGNERS_EAD.map((signer) => ({
      position: signer.position,
      name: signer.name,
      role: signer.role,
      wallet: signer.wallet,
      signed: true,
      txSig: SIG_5,
      signedAt: "2025-12-08T11:20:00.000Z",
    })),
  },
];

export function mockVerifyView(address: string): VerifyCertView | null {
  const match = VERIFY_VIEWS.find((view) => view.address === address);
  return match ?? (isAlias(address) ? VERIFY_VIEWS[0] : null);
}

export function mockVerifyViewByAsset(asset: string): VerifyCertView | null {
  return VERIFY_VIEWS.find((view) => view.asset === asset) ?? null;
}

export function mockCertificateByVerifyCode(
  code: string,
): { address: string } | null {
  const view = VERIFY_VIEWS.find(
    (candidate) => candidate.verifyCode === code.trim().toUpperCase(),
  );
  return view ? { address: view.address } : null;
}

// ---------------------------------------------------------------------------
// Signer inbox
// ---------------------------------------------------------------------------

export function mockPendingForSigner(): PendingEditionGroup[] {
  return [
    {
      editionAddress: EDITION_1,
      editionName: EDITIONS[0].name,
      signerCount: SIGNERS_BOOTCAMP.length,
      callerPosition: 0,
      signers: SIGNERS_BOOTCAMP,
      certificates: [
        {
          address: CERT_PENDING_B,
          studentName: "Juliana Prado Meireles",
          ownerWallet: WALLET_STUDENT_3,
          requestedAt: "2026-08-18T14:02:00.000Z",
          signerBitmap: 0b000,
          signedCount: 0,
          signerCount: 3,
        },
        {
          address: CERT_REQUESTED,
          studentName: "Maria Silva Rodrigues",
          ownerWallet: MOCK_WALLET_STUDENT,
          requestedAt: "2026-08-14T11:30:00.000Z",
          signerBitmap: 0b010,
          signedCount: 1,
          signerCount: 3,
        },
      ],
    },
    {
      editionAddress: EDITION_2,
      editionName: EDITIONS[1].name,
      signerCount: SIGNERS_IMERSAO.length,
      callerPosition: 0,
      signers: SIGNERS_IMERSAO,
      certificates: [
        {
          address: CERT_PENDING_C,
          studentName: "Carlos Eduardo Menezes",
          ownerWallet: WALLET_STUDENT_2,
          requestedAt: "2026-08-19T08:47:00.000Z",
          signerBitmap: 0b10,
          signedCount: 1,
          signerCount: 2,
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

const ATTENDANCE_EVENTS: AttendanceEventRow[] = [
  {
    id: "8f14e45f-ceea-467a-9c3b-1d0ac1b2c001",
    name: "Solana Day Brasil 2026",
    description:
      "Conferência anual da comunidade Solana no Brasil, com trilhas de infraestrutura, DeFi e pagamentos.",
    image_url:
      "https://placehold.co/800x800/1e1b4b/e0e7ff.png?text=Solana+Day+Brasil",
    metadata_uri: "https://exemplo.com.br/metadata/solana-day-brasil-2026.json",
    collection_address: COLLECTION_1,
    event_date: "2026-09-12",
    end_date: null,
    location: "São Paulo, Brasil",
    event_url: "https://exemplo.com.br/solana-day-brasil",
    max_supply: 500,
    // Far-future so this fixture stays in the "aberto" state indefinitely.
    claim_deadline: "2030-12-31T23:59:59.000Z",
    claim_open: true,
    claim_token: "solana-day-brasil-2026",
    created_by_wallet: MOCK_WALLET_CREATOR,
    minted_count: 312,
    created_at: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "8f14e45f-ceea-467a-9c3b-1d0ac1b2c002",
    name: "Superteam Meetup São Paulo #14",
    description:
      "Encontro mensal da Superteam Brasil: demos da comunidade, mesa-redonda e networking.",
    image_url:
      "https://placehold.co/800x800/052e16/bbf7d0.png?text=Meetup+SP+%2314",
    metadata_uri: "https://exemplo.com.br/metadata/meetup-sp-14.json",
    collection_address: COLLECTION_2,
    event_date: "2026-08-28",
    end_date: null,
    location: "São Paulo, Brasil",
    event_url: "",
    max_supply: null,
    claim_deadline: null,
    claim_open: true,
    claim_token: "meetup-sp-14",
    created_by_wallet: MOCK_WALLET_CREATOR,
    minted_count: 87,
    created_at: "2026-08-05T09:30:00.000Z",
  },
  {
    id: "8f14e45f-ceea-467a-9c3b-1d0ac1b2c003",
    name: "Hacker House Rio — Demo Night",
    description:
      "Noite de demos ao final da residência, com apresentação dos oito times selecionados.",
    image_url:
      "https://placehold.co/800x800/431407/fed7aa.png?text=Demo+Night+Rio",
    metadata_uri: "https://exemplo.com.br/metadata/demo-night-rio.json",
    collection_address: COLLECTION_3,
    event_date: "2026-05-18",
    end_date: "2026-05-19",
    location: "Rio de Janeiro, Brasil",
    event_url: "https://exemplo.com.br/hacker-house-rio",
    max_supply: 120,
    // Past deadline: exercises the claim page's "encerrado" state.
    claim_deadline: "2026-05-25T23:59:59.000Z",
    claim_open: true,
    claim_token: "demo-night-rio",
    created_by_wallet: MOCK_WALLET_CREATOR,
    minted_count: 120,
    created_at: "2026-05-01T14:00:00.000Z",
  },
  {
    id: "8f14e45f-ceea-467a-9c3b-1d0ac1b2c004",
    name: "Workshop Anchor — Encerramento",
    description:
      "Sessão de encerramento do workshop de Anchor, com entrega dos projetos finais.",
    image_url:
      "https://placehold.co/800x800/1e293b/cbd5e1.png?text=Workshop+Anchor",
    metadata_uri: "https://exemplo.com.br/metadata/workshop-anchor.json",
    collection_address: COLLECTION_4,
    event_date: "2026-07-04",
    end_date: null,
    location: "Belo Horizonte, Brasil",
    event_url: "",
    max_supply: 100,
    claim_deadline: null,
    // Paused: exercises the claim page's "pausado" state.
    claim_open: false,
    claim_token: "workshop-anchor-encerramento",
    created_by_wallet: MOCK_WALLET_CREATOR,
    minted_count: 45,
    created_at: "2026-06-20T17:45:00.000Z",
  },
];

export function mockAttendanceEvents(): AttendanceEventRow[] {
  return ATTENDANCE_EVENTS;
}

export function mockAttendanceEventByToken(
  token: string,
): AttendanceEventRow | null {
  const match = ATTENDANCE_EVENTS.find((event) => event.claim_token === token);
  return match ?? (isAlias(token) ? ATTENDANCE_EVENTS[0] : null);
}

export function mockAttendanceEventById(id: string): AttendanceEventRow | null {
  const match = ATTENDANCE_EVENTS.find((event) => event.id === id);
  return match ?? (isAlias(id) ? ATTENDANCE_EVENTS[0] : null);
}

/**
 * The visiting wallet's own claim. Only the first event has one, so the claim
 * page renders both branches: "você já resgatou" on that event and the mint
 * call-to-action on the others.
 */
export function mockClaimByEventWallet(
  eventId: string,
): AttendanceClaimRow | null {
  if (eventId !== ATTENDANCE_EVENTS[0].id) return null;
  return {
    id: "b2c3d4e5-1111-4a2b-8c3d-5e6f70819001",
    event_id: ATTENDANCE_EVENTS[0].id,
    wallet: MOCK_WALLET_STUDENT,
    status: "minted",
    reserved_at: "2026-09-12T18:04:00.000Z",
    tx_sig: SIG_1,
    asset_id: ASSET_ATTENDANCE_1,
    mint_serial: 288,
    created_at: "2026-09-12T18:04:12.000Z",
  };
}

const MY_ATTENDANCE: AttendanceClaimForOwner[] = [
  {
    eventName: ATTENDANCE_EVENTS[0].name,
    eventDate: ATTENDANCE_EVENTS[0].event_date,
    imageUrl: ATTENDANCE_EVENTS[0].image_url,
    assetId: ASSET_ATTENDANCE_1,
    txSig: SIG_1,
    claimedAt: "2026-09-12T18:04:12.000Z",
  },
  {
    eventName: ATTENDANCE_EVENTS[2].name,
    eventDate: ATTENDANCE_EVENTS[2].event_date,
    imageUrl: ATTENDANCE_EVENTS[2].image_url,
    assetId: ASSET_ATTENDANCE_2,
    txSig: SIG_2,
    claimedAt: "2026-05-18T22:15:40.000Z",
  },
];

export function mockAttendanceClaimsForOwner(): AttendanceClaimForOwner[] {
  return MY_ATTENDANCE;
}

export function mockClaimByAssetId(
  assetId: string,
): AttendanceClaimPublicView | null {
  const claimed =
    MY_ATTENDANCE.find((claim) => claim.assetId === assetId) ??
    (isAlias(assetId) ? MY_ATTENDANCE[0] : undefined);
  if (!claimed) return null;
  return {
    eventName: claimed.eventName,
    eventImageUrl: claimed.imageUrl,
    eventDate: claimed.eventDate,
    wallet: MOCK_WALLET_STUDENT,
    claimedAt: claimed.claimedAt,
    txSig: claimed.txSig,
    assetId,
  };
}

/** Attendee drawer + CSV export: one row per claim status the table renders. */
export function mockClaimsForEvent(): AttendanceClaimListRow[] {
  return [
    {
      wallet: MOCK_WALLET_STUDENT,
      status: "minted",
      claimedAt: "2026-09-12T18:04:12.000Z",
      txSig: SIG_1,
      assetId: ASSET_ATTENDANCE_1,
    },
    {
      wallet: WALLET_STUDENT_2,
      status: "minted",
      claimedAt: "2026-09-12T17:58:03.000Z",
      txSig: SIG_2,
      assetId: ASSET_ATTENDANCE_2,
    },
    {
      wallet: WALLET_STUDENT_3,
      status: "pending",
      claimedAt: "2026-09-12T17:55:31.000Z",
      txSig: null,
      assetId: null,
    },
    {
      wallet: WALLET_SIGNER_2,
      status: "failed",
      claimedAt: "2026-09-12T17:41:09.000Z",
      txSig: null,
      assetId: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Drafts and signer invites
// ---------------------------------------------------------------------------

const DRAFT_READY = "d1a2b3c4-0000-4f5a-9b6c-7d8e9f0a1001";
const DRAFT_PENDING = "d1a2b3c4-0000-4f5a-9b6c-7d8e9f0a1002";

const DRAFTS: EditionDraftRow[] = [
  {
    id: DRAFT_READY,
    meta: {
      name: "Pós-Graduação em Blockchain — Turma 3",
      slug: "pos-blockchain-turma-3",
      description:
        "Curso de especialização com 360 horas, entregue em parceria com a universidade. Todos os signatários já aceitaram o convite.",
      maxSupply: 80,
      completionDate: "2026-11-30",
    },
    layout: null,
    template_sha: SHA_CLAIMED,
    chain_address: null,
    created_by: MOCK_DID,
    created_at: "2026-08-06T10:00:00.000Z",
    updated_at: "2026-08-19T15:42:00.000Z",
  },
  {
    id: DRAFT_PENDING,
    meta: {
      name: "Workshop de Segurança em Smart Contracts",
      slug: "workshop-seguranca-smart-contracts",
      description:
        "Workshop intensivo de dois dias sobre auditoria e padrões seguros. Aguardando dois signatários vincularem carteira.",
      maxSupply: null,
      completionDate: "2026-10-10",
    },
    layout: null,
    template_sha: null,
    chain_address: null,
    created_by: MOCK_DID,
    created_at: "2026-08-15T09:20:00.000Z",
    updated_at: "2026-08-20T08:11:00.000Z",
  },
];

const INVITES: SignerInviteRow[] = [
  {
    id: "17a1b2c3-0000-4d5e-8f90-a1b2c3d4e001",
    draft_id: DRAFT_READY,
    name: "Ana Beatriz Carvalho",
    role: "Coordenadora Acadêmica",
    email: "ana.carvalho@exemplo.edu.br",
    token: "convite-ana-carvalho",
    status: "accepted",
    wallet: MOCK_WALLET_SIGNER,
    invited_at: "2026-08-06T10:05:00.000Z",
    accepted_at: "2026-08-07T13:22:00.000Z",
    reminded_at: null,
  },
  {
    id: "17a1b2c3-0000-4d5e-8f90-a1b2c3d4e002",
    draft_id: DRAFT_READY,
    name: "João Pedro Vasconcelos",
    role: "Reitor",
    email: "joao.vasconcelos@exemplo.edu.br",
    token: "convite-joao-vasconcelos",
    status: "accepted",
    wallet: WALLET_SIGNER_2,
    invited_at: "2026-08-06T10:05:00.000Z",
    accepted_at: "2026-08-08T09:14:00.000Z",
    reminded_at: "2026-08-07T09:00:00.000Z",
  },
  {
    id: "17a1b2c3-0000-4d5e-8f90-a1b2c3d4e003",
    draft_id: DRAFT_PENDING,
    name: "Mariana Alves Pinto",
    role: "Instrutora Líder",
    email: "mariana.pinto@exemplo.edu.br",
    token: "convite-mariana-pinto",
    status: "accepted",
    wallet: WALLET_SIGNER_3,
    invited_at: "2026-08-15T09:25:00.000Z",
    accepted_at: "2026-08-16T11:40:00.000Z",
    reminded_at: null,
  },
  {
    id: "17a1b2c3-0000-4d5e-8f90-a1b2c3d4e004",
    draft_id: DRAFT_PENDING,
    name: "Rafael Nogueira Lima",
    role: "Diretor de Educação",
    email: "rafael.lima@exemplo.edu.br",
    token: "convite-rafael-lima",
    status: "invited",
    wallet: null,
    invited_at: "2026-08-15T09:25:00.000Z",
    accepted_at: null,
    reminded_at: "2026-08-18T09:00:00.000Z",
  },
  {
    id: "17a1b2c3-0000-4d5e-8f90-a1b2c3d4e005",
    draft_id: DRAFT_PENDING,
    name: "Lucas Ferreira Braga",
    role: "Organizador",
    email: "lucas.braga@exemplo.edu.br",
    token: "convite-lucas-braga",
    status: "expired",
    wallet: null,
    invited_at: "2026-08-15T09:25:00.000Z",
    accepted_at: null,
    reminded_at: null,
  },
];

export function mockDrafts(): EditionDraftRow[] {
  return DRAFTS;
}

export function mockDraft(id: string): EditionDraftRow | null {
  const match = DRAFTS.find((draft) => draft.id === id);
  return match ?? (isAlias(id) ? DRAFTS[0] : null);
}

export function mockInvites(draftId: string): SignerInviteRow[] {
  // Resolve the alias first so an aliased draft still comes with its seats.
  const id = isAlias(draftId) ? DRAFTS[0].id : draftId;
  return INVITES.filter((invite) => invite.draft_id === id);
}

export function mockInvitesForDrafts(draftIds: string[]): SignerInviteRow[] {
  return INVITES.filter((invite) => draftIds.includes(invite.draft_id));
}

export function mockInviteByToken(token: string): SignerInviteWithDraft | null {
  const invite =
    INVITES.find((candidate) => candidate.token === token) ??
    (isAlias(token) ? INVITES[0] : undefined);
  const draft = invite ? mockDraft(invite.draft_id) : null;
  return invite && draft ? { ...invite, draft } : null;
}
