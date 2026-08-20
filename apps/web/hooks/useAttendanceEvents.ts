"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { onAppError } from "@/lib/on-app-error";
import type { ProofPayload } from "@/hooks/useWalletProof";
import type { AttendanceEventView } from "@/app/api/attendance/events/route";
import type { AttendanceClaimListRow } from "@/lib/db/attendance-queries";
import type { CreateEventInput } from "@/lib/attendance/schemas";

/** Creator dashboard's event list. */
export function useAttendanceEvents(): UseQueryResult<AttendanceEventView[]> {
  return useQuery({
    queryKey: ["attendance", "events"],
    queryFn: () => api<AttendanceEventView[]>("/api/attendance/events"),
    retry: false,
  });
}

/**
 * Attendee list for one event — backs the dashboard's attendee drawer and CSV
 * export (P1-4). Fetches only while a drawer is open (`eventId` non-null).
 */
export function useEventClaims(
  eventId: string | null,
): UseQueryResult<AttendanceClaimListRow[]> {
  return useQuery({
    queryKey: ["attendance", "events", eventId, "claims"],
    queryFn: () =>
      api<AttendanceClaimListRow[]>(`/api/attendance/events/${eventId}/claims`),
    enabled: eventId !== null,
    retry: false,
  });
}

/** Creates an event — image + metadata upload and collection mint happen server-side. */
export function useCreateEvent(): UseMutationResult<
  AttendanceEventView,
  Error,
  CreateEventInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEventInput) =>
      api<AttendanceEventView>("/api/attendance/events", { json: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["attendance", "events"],
      });
    },
    onError: (err) => onAppError(err),
  });
}

/** Creator dashboard row actions: pause/resume the claim window, or rotate the public claim link. */
export function useEventAction(): UseMutationResult<
  AttendanceEventView,
  Error,
  { id: string; action: "pause" | "resume" | "rotate" }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "pause" | "resume" | "rotate";
    }) =>
      api<AttendanceEventView>(`/api/attendance/events/${id}`, {
        json: { action },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["attendance", "events"],
      });
    },
    onError: (err) => onAppError(err),
  });
}

/**
 * Creator sign-in: proves wallet ownership for the "attendance-creator"
 * purpose, then verifies server-side (allowlist check + session cookie).
 * Takes the caller's `prove` fn (from `useWalletProof`) rather than calling
 * it itself, so this hook stays free of wallet-standard concerns.
 */
export function useCreatorSignin(
  prove: (purpose: "attendance-creator") => Promise<ProofPayload>,
): UseMutationResult<{ wallet: string }, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<{ wallet: string }, Error, void>({
    mutationFn: async () => {
      const proof = await prove("attendance-creator");
      return api<{ wallet: string }>("/api/attendance/auth/verify", {
        json: proof,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["attendance", "events"],
      });
    },
    onError: (err) => onAppError(err),
  });
}
