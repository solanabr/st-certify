"use client";

import { useCallback, useState } from "react";
import { useUploadTemplate } from "@/hooks/useUploadTemplate";
import {
  blobToDataUri,
  downscaleImageFile,
  isPngFile,
  sha256Hex,
} from "./image-utils";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_LONG_EDGE_PX = 2400;

export interface TemplateAsset {
  sha256: string;
  width: number;
  height: number;
  /** Data URI — always usable for the canvas/preview regardless of storage outcome. */
  previewUrl: string;
  /** Supabase public URL, or null when storage is unconfigured/failed. */
  storedUrl: string | null;
  /** True when the bytes only exist in this tab's memory (Supabase unconfigured, or the upload call failed) — the designer still works, but publishing needs storage. */
  degraded: boolean;
  degradedReason?: string;
}

export type TemplateUploadStatus = "idle" | "processing" | "ready" | "error";

export interface UseTemplateDesignerUpload {
  status: TemplateUploadStatus;
  asset: TemplateAsset | null;
  error: string | null;
  upload: (file: File) => Promise<void>;
  reset: () => void;
}

/**
 * Orchestrates the M6 upload deliverable end to end: validate -> downscale
 * to <=2400px long edge -> hash client-side -> upload -> degrade cleanly.
 * A failed/unconfigured upload is NOT surfaced as `status: "error"` — the
 * designer stays usable with the in-memory data URI (brief: "degrade
 * cleanly on empty Supabase URL"); `status: "error"` is reserved for
 * problems with the file itself (wrong type, too big, undecodable).
 */
export function useTemplateDesignerUpload(): UseTemplateDesignerUpload {
  const [status, setStatus] = useState<TemplateUploadStatus>("idle");
  const [asset, setAsset] = useState<TemplateAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadMutation = useUploadTemplate();

  const upload = useCallback(
    async (file: File) => {
      setError(null);

      if (file.type !== "image/png") {
        setStatus("error");
        setError("Envie um arquivo PNG.");
        return;
      }
      if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
        setStatus("error");
        setError("A imagem deve ter no máximo 8MB.");
        return;
      }

      setStatus("processing");
      try {
        if (!(await isPngFile(file))) {
          setStatus("error");
          setError("O arquivo enviado não é um PNG válido.");
          return;
        }

        const { blob, width, height } = await downscaleImageFile(
          file,
          MAX_LONG_EDGE_PX,
        );
        const buffer = await blob.arrayBuffer();
        const [localSha256, previewUrl] = await Promise.all([
          sha256Hex(buffer),
          blobToDataUri(blob),
        ]);

        try {
          const result = await uploadMutation.mutateAsync(blob);
          setAsset({
            sha256: result.stored ? result.sha256 : localSha256,
            width,
            height,
            previewUrl,
            storedUrl: result.stored ? result.url : null,
            degraded: !result.stored,
            degradedReason: result.stored ? undefined : result.reason,
          });
        } catch (uploadErr) {
          // Network/server failure: still degrade cleanly rather than
          // blocking the whole step — the admin can keep designing.
          setAsset({
            sha256: localSha256,
            width,
            height,
            previewUrl,
            storedUrl: null,
            degraded: true,
            degradedReason:
              uploadErr instanceof Error
                ? uploadErr.message
                : "Falha ao enviar a imagem.",
          });
        }
        setStatus("ready");
      } catch (processErr) {
        setStatus("error");
        setError(
          processErr instanceof Error
            ? processErr.message
            : "Falha ao processar a imagem.",
        );
      }
    },
    [uploadMutation],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setAsset(null);
    setError(null);
  }, []);

  return { status, asset, error, upload, reset };
}
