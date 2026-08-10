"use client";

import { useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies an absolute verify link to the clipboard with a brief confirmed state. */
export function CopyLinkButton({
  path,
  label = "Copiar link",
}: {
  path: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context / permissions) — no-op; the link is visible.
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void copy()}>
      {copied ? <Check /> : <LinkIcon />}
      {copied ? "Link copiado" : label}
    </Button>
  );
}
