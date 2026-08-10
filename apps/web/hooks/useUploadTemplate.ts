"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface UploadTemplateResponse {
  sha256: string;
  width: number | null;
  height: number | null;
  stored: boolean;
  url: string | null;
  reason?: string;
}

/**
 * Wizard step 4 (Designer): uploads the (already client-downscaled) template
 * PNG to `POST /api/admin/templates`. `stored: false` in the response is a
 * normal, non-error outcome (Supabase unconfigured) — see
 * `use-template-upload.ts`, which is what actually decides how to react.
 */
export function useUploadTemplate(): UseMutationResult<
  UploadTemplateResponse,
  Error,
  Blob
> {
  return useMutation({
    mutationFn: (blob: Blob) => {
      const formData = new FormData();
      formData.append("file", blob, "template.png");
      return api<UploadTemplateResponse>("/api/admin/templates", {
        method: "POST",
        body: formData,
      });
    },
  });
}
