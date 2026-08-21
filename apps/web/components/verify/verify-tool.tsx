"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Loader2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import {
  classifyVerifyInput,
  resolveHashToCert,
  sha256HexOf,
  type VerifyInput,
} from "@/lib/chain/verify";
import {
  attemptResolve,
  statusForOutcome,
  type ResolveOutcome,
  type VerifyStatus,
} from "@/components/verify/verify-outcome";
import {
  artifactShaFromPdf,
  isPdfBytes,
  normalizeValidationCode,
} from "@/components/verify/verify-input";

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

async function resolveQuery(
  parsed: Extract<VerifyInput, { kind: "hash" } | { kind: "base58" }>,
): Promise<ResolveOutcome> {
  if (parsed.kind === "hash") {
    const cert = await resolveHashToCert(parsed.value);
    return cert ? { kind: "hit", certId: cert } : { kind: "miss" };
  }
  // base58 — could be a cert PDA or an asset; the [id] page resolves both.
  return { kind: "hit", certId: parsed.value };
}

/** The paper path: the 8-character code printed in the PDF footer. */
async function resolveCode(code: string): Promise<ResolveOutcome> {
  const { address } = await api<{ address: string | null }>(
    `/api/verify/resolve-code/${code}`,
  );
  return address ? { kind: "hit", certId: address } : { kind: "miss" };
}

async function resolveFile(file: File): Promise<ResolveOutcome> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  // An exported PDF carries the certificate's hash in its metadata, so it
  // resolves without the browser having to understand PDF at all. Its own bytes
  // are NOT the committed artifact — the PNG inside it is — so hashing the file
  // would always miss.
  if (isPdfBytes(bytes)) {
    const embedded = artifactShaFromPdf(bytes);
    if (!embedded) return { kind: "miss" };
    const cert = await resolveHashToCert(embedded);
    return cert ? { kind: "hit", certId: cert } : { kind: "miss" };
  }

  const hash = await sha256HexOf(bytes);
  const exact = await resolveHashToCert(hash);
  if (exact) return { kind: "hit", certId: exact };

  // Hash miss — try the embedded QR (the file is likely a re-encode).
  const qr = await decodeQrFromFile(file);
  if (qr) {
    const parsed = classifyVerifyInput(qr);
    if (parsed.kind === "base58") {
      return { kind: "hit", certId: parsed.value, reencode: true };
    }
    if (parsed.kind === "hash") {
      const cert = await resolveHashToCert(parsed.value);
      if (cert) return { kind: "hit", certId: cert, reencode: true };
    }
  }
  return { kind: "miss" };
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
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAttemptRef = useRef<(() => Promise<ResolveOutcome>) | null>(null);

  function goToCert(certId: string, reencode = false): void {
    router.push(`/verify/${certId}${reencode ? "?reencode=1" : ""}`);
  }

  async function run(resolve: () => Promise<ResolveOutcome>): Promise<void> {
    lastAttemptRef.current = resolve;
    setStatus("busy");
    const outcome = await attemptResolve(resolve);
    setStatus(statusForOutcome(outcome));
    if (outcome.kind === "hit") goToCert(outcome.certId, outcome.reencode);
  }

  function submitQuery(): void {
    // Codes are checked first: an 8-character code is never a valid address or
    // hash, so this can only claim inputs the other paths would have rejected.
    const code = normalizeValidationCode(query);
    if (code) {
      void run(() => resolveCode(code));
      return;
    }

    const parsed = classifyVerifyInput(query);
    if (parsed.kind === "empty" || parsed.kind === "unknown") {
      setStatus("notfound");
      return;
    }
    void run(() => resolveQuery(parsed));
  }

  const busy = status === "busy";

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitQuery();
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="verify-query">{t("verify.tool.inputLabel")}</Label>
          <Input
            id="verify-query"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (status === "notfound" || status === "error")
                setStatus("idle");
            }}
            placeholder={t("verify.tool.inputPlaceholder")}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
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
          if (file) void run(() => resolveFile(file));
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background ${
          dragging ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">
          {t("verify.tool.dropPrompt")}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("verify.tool.dropHint")}
        </span>
        <input
          id="verify-file"
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void run(() => resolveFile(file));
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

      {/* Distinct from "notfound": we could not check, so we say nothing about
          whether the certificate exists. */}
      {status === "error" && (
        <Alert aria-live="polite">
          <AlertTitle>{t("system.error.title")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            {t("system.error.body")}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const retry = lastAttemptRef.current;
                if (retry) void run(retry);
              }}
            >
              {t("system.error.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
