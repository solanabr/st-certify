"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAdminEditions } from "@/hooks/useAdminEditions";
import type {
  EditionDraftMeta,
  EditionStatusValue,
  EditionWithSigners,
} from "@/lib/db/types";

export type StudioSeatStatus = "invited" | "accepted" | "expired";

export interface StudioSeat {
  id: string;
  name: string;
  role: string;
  /** Null for on-chain rosters — those signers were entered as wallets. */
  email: string | null;
  status: StudioSeatStatus;
  wallet: string | null;
}

export interface StudioEditionView {
  /** Draft id before the chain write, on-chain address after. */
  id: string;
  /** `draft` is still editable; `managed` exists on-chain. */
  mode: "draft" | "managed";
  name: string;
  slug: string | null;
  description: string | null;
  chainAddress: string | null;
  /** Null while the edition is still a draft — status is an on-chain field. */
  status: EditionStatusValue | null;
  /** Null means uncapped. */
  maxSupply: number | null;
  minted: number;
  requested: number;
  completionDate: string | null;
  createdAt: string;
  seats: StudioSeat[];
  /**
   * Seats came from the on-chain roster rather than `signer_invites`, so there
   * is no invite lifecycle to manage and no re-send to offer. This is what
   * puts pre-overhaul editions into management-only mode.
   */
  seatsFromChain: boolean;
  /** Public catalog path, once there is a slug to link to. */
  publicPath: string | null;
}

/**
 * Pinned by the W2-A work order. Swap these for W2-A's exported types at
 * reconcile time — the shape is the contract, this declaration is a stand-in
 * so the page can be built and tested before their routes land.
 */
interface SeatView {
  id: string;
  name: string;
  role: string;
  email: string;
  status: StudioSeatStatus;
  wallet: string | null;
}

interface DraftView {
  id: string;
  meta: EditionDraftMeta;
  layout: Record<string, unknown> | null;
  templateSha: string | null;
  chainAddress: string | null;
  seats: SeatView[];
}

function fromChain(edition: EditionWithSigners): StudioEditionView {
  return {
    id: edition.address,
    mode: "managed",
    name: edition.name,
    slug: edition.slug,
    description: edition.description,
    chainAddress: edition.address,
    status: edition.status,
    // The mirror stores an uncapped edition as 0; the UI distinguishes
    // "sem limite" from "0 disponíveis", so normalize it here.
    maxSupply: edition.maxSupply > 0 ? edition.maxSupply : null,
    minted: edition.minted,
    requested: edition.requested,
    completionDate: edition.completionDate,
    createdAt: edition.createdAt,
    seats: edition.signers.map((signer) => ({
      id: signer.wallet,
      name: signer.name,
      role: signer.role ?? "",
      email: null,
      status: "accepted",
      wallet: signer.wallet,
    })),
    seatsFromChain: true,
    publicPath: `/certificates/${edition.slug}`,
  };
}

function fromDraft(draft: DraftView): StudioEditionView {
  const slug = draft.meta.slug ?? null;
  return {
    id: draft.id,
    mode: "draft",
    name: draft.meta.name ?? "",
    slug,
    description: draft.meta.description ?? null,
    chainAddress: draft.chainAddress,
    status: null,
    maxSupply: draft.meta.maxSupply ?? null,
    minted: 0,
    requested: 0,
    completionDate: draft.meta.completionDate ?? null,
    createdAt: "",
    seats: draft.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      role: seat.role,
      email: seat.email,
      status: seat.status,
      wallet: seat.wallet,
    })),
    seatsFromChain: false,
    // A draft has no public page until it is on-chain and open.
    publicPath: null,
  };
}

export interface StudioEditionResult {
  data: StudioEditionView | undefined;
  isPending: boolean;
  isError: boolean;
  /** Both lookups resolved and neither matched — a genuinely unknown id. */
  notFound: boolean;
  refetch: () => void;
}

/**
 * Resolves one management page from either side of the overhaul: `[id]` is an
 * on-chain address or slug for an edition that already exists, or a draft id
 * for one that does not yet. The on-chain list is consulted first because it
 * is already cached by the dashboard, so the common case costs no request; the
 * draft lookup only runs once that list has resolved without a match, which is
 * also what keeps invite-management UI from rendering for editions that have
 * no invite rows.
 */
export function useStudioEdition(id: string): StudioEditionResult {
  const editions = useAdminEditions();

  const onChain = editions.data?.find(
    (edition) => edition.address === id || edition.slug === id,
  );

  const draft = useQuery({
    queryKey: ["studio", "draft", id],
    queryFn: () => api<DraftView>(`/api/studio/drafts/${id}`),
    enabled: editions.isSuccess && onChain === undefined,
    retry: false,
  });

  if (onChain) {
    return {
      data: fromChain(onChain),
      isPending: false,
      isError: false,
      notFound: false,
      refetch: () => void editions.refetch(),
    };
  }

  const refetch = (): void => {
    void editions.refetch();
    void draft.refetch();
  };

  return {
    data: draft.data ? fromDraft(draft.data) : undefined,
    isPending: editions.isPending || (draft.isEnabled && draft.isPending),
    isError: editions.isError,
    notFound: editions.isSuccess && draft.isError,
    refetch,
  };
}
