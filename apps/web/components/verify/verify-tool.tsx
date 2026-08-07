"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Loader2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useT } from "@/lib/i18n";
import {
  classifyVerifyInput,
  resolveHashToCert,
  sha256HexOf,
} from "@/lib/chain/verify";

type Status = "idle" | "busy" | "notfound";

function imageDataAtWidth(
  bitmap: ImageBitmap,
  targetWidth: number,
): ImageData | null {
  const scale = targetWidth / bitmap.width;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Decode a QR from an image file, trying natural then 1024 then 512 px wide. */
async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const widths = [...new Set([bitmap.width, 1024, 512])].filter(
    (w) => w <= bitmap.width,
  );
  for (const target of widths.length > 0 ? widths : [bitmap.width]) {
    const img = imageDataAtWidth(bitmap, target);
    if (!img) continue;
    const result = jsQR(img.data, img.width, img.height);
    if (result?.data) return result.data;
  }
  return null;
}

/**
 * The public verify tool (plan §Verify): a smart text input (URL / cert PDA /
 * asset / 64-hex hash) and a PNG drop zone. A dropped file is hashed IN THE
 * BROWSER (WebCrypto) → HashIndex lookup; a miss falls back to decoding the
 * embedded QR (re-encode path, e.g. a screenshot). Resolves to `/verify/[id]`,
 * where the full verdict + live chain-check render.
 */
export function VerifyTool() {
  const router = useRouter();
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function goToCert(certId: string, reencode = false): void {
    router.push(`/verify/${certId}${reencode ? "?reencode=1" : ""}`);
  }

  async function submitQuery(): Promise<void> {
    const parsed = classifyVerifyInput(query);
    if (parsed.kind === "empty" || parsed.kind === "unknown") {
      setStatus("notfound");
      return;
    }
    setStatus("busy");
    try {
      if (parsed.kind === "hash") {
        const cert = await resolveHashToCert(parsed.value);
        if (cert) return goToCert(cert);
        setStatus("notfound");
        return;
      }
      // base58 — could be a cert PDA or an asset; the [id] page resolves both.
      goToCert(parsed.value);
    } catch {
      setStatus("notfound");
    }
  }

  async function handleFile(file: File): Promise<void> {
    setStatus("busy");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await sha256HexOf(bytes);
      const exact = await resolveHashToCert(hash);
      if (exact) return goToCert(exact);

      // Hash miss — try the embedded QR (the file is likely a re-encode).
      const qr = await decodeQrFromFile(file);
      if (qr) {
        const parsed = classifyVerifyInput(qr);
        if (parsed.kind === "base58") return goToCert(parsed.value, true);
        if (parsed.kind === "hash") {
          const cert = await resolveHashToCert(parsed.value);
          if (cert) return goToCert(cert, true);
        }
      }
      setStatus("notfound");
    } catch {
      setStatus("notfound");
    }
  }

  const busy = status === "busy";

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitQuery();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (status === "notfound") setStatus("idle");
          }}
          placeholder={t("verify.inputPlaceholder")}
          aria-label={t("verify.inputPlaceholder")}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || query.trim().length === 0}>
          {busy ? <Loader2 className="animate-spin" /> : <Search />}
          {t("verify.check")}
        </Button>
      </form>

      <label
        htmlFor="verify-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background ${
          dragging ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">{t("verify.dropPrompt")}</span>
        <span className="text-xs text-muted-foreground">
          {t("verify.dropHint")}
        </span>
        <input
          id="verify-file"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </label>

      {busy && (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("verify.resolving")}
        </p>
      )}

      {status === "notfound" && (
        <Alert aria-live="polite">
          <AlertTitle>{t("verify.notFound")}</AlertTitle>
          <AlertDescription>{t("verify.notFoundHint")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
