"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ImageUp, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { TemplateUploadStatus } from "./use-template-upload";

export interface TemplateUploadCardProps {
  status: TemplateUploadStatus;
  error: string | null;
  onFile: (file: File) => void;
}

/**
 * The step-4 entry state: drag-and-drop or click-to-browse for the base PNG.
 * Renders the loading/error states too — once `status === "ready"` the
 * caller swaps this out for the canvas (see wizard-designer-step.tsx).
 */
export function TemplateUploadCard({
  status,
  error,
  onFile,
}: TemplateUploadCardProps): React.JSX.Element {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const busy = status === "processing";

  function handleFiles(files: FileList | null): void {
    const file = files?.[0];
    if (file) {
      onFile(file);
    }
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        aria-label={t("designer.upload.dropzoneAria")}
        className={cn(
          "flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
          dragOver ? "border-primary bg-primary/5" : "border-border",
          busy && "pointer-events-none opacity-70",
        )}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <Loader2
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ImageUp
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <div>
          <p className="font-medium" aria-live="polite">
            {busy ? t("designer.upload.processing") : t("verify.dropPrompt")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("designer.upload.hint")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          tabIndex={-1}
        >
          {t("designer.upload.chooseFile")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {status === "error" && error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("designer.upload.errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
